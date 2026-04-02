<?php

declare(strict_types=1);

require __DIR__ . '/lib/bootstrap.php';

$action = $_GET['action'] ?? '';
$method = $_SERVER['REQUEST_METHOD'] ?? 'GET';
$body = read_json_body();

function encode_path_value(string $value): string
{
    return str_replace('%3A', ':', rawurlencode($value));
}

function fetch_tours_and_sessions(): array
{
    $tourResponse = supabase_request(
        'GET',
        'rest/v1/tours?select=id,title,description,level,price,location,created_at&order=created_at.desc',
        null,
        true
    );
    $sessionResponse = supabase_request(
        'GET',
        'rest/v1/sessions?select=id,tour_id,start_time,capacity,remaining_slots,created_at&order=start_time.asc',
        null,
        true
    );

    if (!$tourResponse['ok'] || !$sessionResponse['ok']) {
        json_response(['ok' => false, 'message' => 'Unable to load tours or sessions.'], 500);
    }

    $sessionsByTour = [];
    foreach (($sessionResponse['data'] ?? []) as $session) {
        $sessionsByTour[$session['tour_id']][] = $session;
    }

    $tours = [];
    foreach (($tourResponse['data'] ?? []) as $tour) {
        $tour['sessions'] = $sessionsByTour[$tour['id']] ?? [];
        $tours[] = $tour;
    }

    return $tours;
}

function sync_profile(array $body): void
{
    [$token, $user] = auth_user();
    $payload = [
        'full_name' => trim((string) ($body['full_name'] ?? ($user['user_metadata']['full_name'] ?? ''))),
        'email' => $user['email'] ?? '',
    ];

    $existing = fetch_profile($user['id']);
    if ($existing) {
        $response = supabase_request(
            'PATCH',
            'rest/v1/profiles?id=eq.' . encode_path_value($user['id']),
            $payload,
            true,
            $token
        );
    } else {
        $response = supabase_request(
            'POST',
            'rest/v1/profiles',
            [
                'id' => $user['id'],
                'full_name' => $payload['full_name'],
                'email' => $payload['email'],
                'is_admin' => false,
            ],
            true,
            $token
        );
    }

    if (!$response['ok']) {
        json_response(['ok' => false, 'message' => 'Unable to sync profile.'], 500);
    }

    json_response(['ok' => true, 'message' => 'Profile synced.']);
}

function create_order(array $body): void
{
    [$token, $user] = auth_user();
    $sessionId = (string) ($body['session_id'] ?? '');
    $quantity = max(1, (int) ($body['quantity'] ?? 1));

    if ($sessionId === '') {
        json_response(['ok' => false, 'message' => 'Session is required.'], 422);
    }

    $sessionResponse = supabase_request(
        'GET',
        'rest/v1/sessions?select=id,tour_id,start_time,capacity,remaining_slots&id=eq.' . encode_path_value($sessionId),
        null,
        true
    );

    if (!$sessionResponse['ok'] || empty($sessionResponse['data'][0])) {
        json_response(['ok' => false, 'message' => 'Session not found.'], 404);
    }

    $session = $sessionResponse['data'][0];
    $remaining = (int) ($session['remaining_slots'] ?? 0);

    if ($remaining < $quantity) {
        json_response(['ok' => false, 'message' => 'Not enough slots available.'], 422);
    }

    $tourResponse = supabase_request(
        'GET',
        'rest/v1/tours?select=id,title,price&id=eq.' . encode_path_value((string) $session['tour_id']),
        null,
        true
    );

    if (!$tourResponse['ok'] || empty($tourResponse['data'][0])) {
        json_response(['ok' => false, 'message' => 'Tour not found.'], 404);
    }

    $tour = $tourResponse['data'][0];
    $totalAmount = ((int) $tour['price']) * $quantity;

    $orderResponse = supabase_request(
        'POST',
        'rest/v1/orders',
        [
            'user_id' => $user['id'],
            'session_id' => $session['id'],
            'tour_id' => $tour['id'],
            'quantity' => $quantity,
            'total_amount' => $totalAmount,
        ],
        true,
        $token
    );

    if (!$orderResponse['ok']) {
        json_response(['ok' => false, 'message' => 'Unable to create order.'], 500);
    }

    $updateResponse = supabase_request(
        'PATCH',
        'rest/v1/sessions?id=eq.' . encode_path_value((string) $session['id']),
        ['remaining_slots' => $remaining - $quantity],
        true,
        $token
    );

    if (!$updateResponse['ok']) {
        json_response(['ok' => false, 'message' => 'Order created but slot update failed.'], 500);
    }

    json_response(['ok' => true, 'message' => 'Booking completed.']);
}

switch ($action) {
    case 'sessions':
        if ($method !== 'GET') {
            json_response(['ok' => false, 'message' => 'Method Not Allowed'], 405);
        }
        json_response(['ok' => true, 'data' => fetch_tours_and_sessions()]);
        break;

    case 'profile':
        if ($method !== 'GET') {
            json_response(['ok' => false, 'message' => 'Method Not Allowed'], 405);
        }
        [, $user] = auth_user();
        json_response([
            'ok' => true,
            'data' => [
                'user' => $user,
                'profile' => fetch_profile($user['id']),
            ],
        ]);
        break;

    case 'sync_profile':
        if ($method !== 'POST') {
            json_response(['ok' => false, 'message' => 'Method Not Allowed'], 405);
        }
        sync_profile($body);
        break;

    case 'create_order':
        if ($method !== 'POST') {
            json_response(['ok' => false, 'message' => 'Method Not Allowed'], 405);
        }
        create_order($body);
        break;

    case 'my_orders':
        if ($method !== 'GET') {
            json_response(['ok' => false, 'message' => 'Method Not Allowed'], 405);
        }
        [, $user] = auth_user();
        $orderResponse = supabase_request(
            'GET',
            'rest/v1/orders?select=id,quantity,total_amount,created_at,sessions(id,start_time),tours(id,title,level)&user_id=eq.' . encode_path_value($user['id']) . '&order=created_at.desc',
            null,
            true
        );
        if (!$orderResponse['ok']) {
            json_response(['ok' => false, 'message' => 'Unable to load order history.'], 500);
        }
        json_response(['ok' => true, 'data' => $orderResponse['data'] ?? []]);
        break;

    case 'admin_orders':
        if ($method !== 'GET') {
            json_response(['ok' => false, 'message' => 'Method Not Allowed'], 405);
        }
        require_admin();
        $filters = [];
        if (!empty($_GET['tour_id'])) {
            $filters[] = 'tour_id=eq.' . encode_path_value((string) $_GET['tour_id']);
        }
        if (!empty($_GET['date'])) {
            $date = (string) $_GET['date'];
            $filters[] = 'created_at=gte.' . $date . 'T00:00:00';
            $filters[] = 'created_at=lte.' . $date . 'T23:59:59';
        }
        $query = 'rest/v1/orders?select=id,quantity,total_amount,created_at,profiles(full_name,email),sessions(start_time),tours(title,level)&order=created_at.desc';
        if ($filters) {
            $query .= '&' . implode('&', $filters);
        }
        $response = supabase_request('GET', $query, null, true);
        if (!$response['ok']) {
            json_response(['ok' => false, 'message' => 'Unable to load admin orders.'], 500);
        }
        json_response(['ok' => true, 'data' => $response['data'] ?? []]);
        break;

    case 'save_tour':
        if ($method !== 'POST') {
            json_response(['ok' => false, 'message' => 'Method Not Allowed'], 405);
        }
        require_admin();
        $tourId = trim((string) ($body['id'] ?? ''));
        $payload = [
            'title' => trim((string) ($body['title'] ?? '')),
            'level' => trim((string) ($body['level'] ?? 'Beginner')),
            'price' => (int) ($body['price'] ?? 0),
            'location' => trim((string) ($body['location'] ?? '')),
            'description' => trim((string) ($body['description'] ?? '')),
        ];
        $path = 'rest/v1/tours';
        $httpMethod = 'POST';
        if ($tourId !== '') {
            $path .= '?id=eq.' . encode_path_value($tourId);
            $httpMethod = 'PATCH';
        }
        $response = supabase_request($httpMethod, $path, $payload, true);
        if (!$response['ok']) {
            json_response(['ok' => false, 'message' => 'Unable to save tour.'], 500);
        }
        json_response(['ok' => true, 'message' => 'Tour saved.']);
        break;

    case 'delete_tour':
        if ($method !== 'POST') {
            json_response(['ok' => false, 'message' => 'Method Not Allowed'], 405);
        }
        require_admin();
        $tourId = trim((string) ($body['id'] ?? ''));
        if ($tourId === '') {
            json_response(['ok' => false, 'message' => 'Tour id is required.'], 422);
        }
        $response = supabase_request('DELETE', 'rest/v1/tours?id=eq.' . encode_path_value($tourId), null, true);
        if (!$response['ok']) {
            json_response(['ok' => false, 'message' => 'Unable to delete tour.'], 500);
        }
        json_response(['ok' => true, 'message' => 'Tour deleted.']);
        break;

    case 'save_session':
        if ($method !== 'POST') {
            json_response(['ok' => false, 'message' => 'Method Not Allowed'], 405);
        }
        require_admin();
        $sessionId = trim((string) ($body['id'] ?? ''));
        $payload = [
            'tour_id' => trim((string) ($body['tour_id'] ?? '')),
            'start_time' => trim((string) ($body['start_time'] ?? '')),
            'capacity' => (int) ($body['capacity'] ?? 0),
            'remaining_slots' => (int) ($body['remaining_slots'] ?? 0),
        ];
        $path = 'rest/v1/sessions';
        $httpMethod = 'POST';
        if ($sessionId !== '') {
            $path .= '?id=eq.' . encode_path_value($sessionId);
            $httpMethod = 'PATCH';
        }
        $response = supabase_request($httpMethod, $path, $payload, true);
        if (!$response['ok']) {
            json_response(['ok' => false, 'message' => 'Unable to save session.'], 500);
        }
        json_response(['ok' => true, 'message' => 'Session saved.']);
        break;

    case 'delete_session':
        if ($method !== 'POST') {
            json_response(['ok' => false, 'message' => 'Method Not Allowed'], 405);
        }
        require_admin();
        $sessionId = trim((string) ($body['id'] ?? ''));
        if ($sessionId === '') {
            json_response(['ok' => false, 'message' => 'Session id is required.'], 422);
        }
        $response = supabase_request('DELETE', 'rest/v1/sessions?id=eq.' . encode_path_value($sessionId), null, true);
        if (!$response['ok']) {
            json_response(['ok' => false, 'message' => 'Unable to delete session.'], 500);
        }
        json_response(['ok' => true, 'message' => 'Session deleted.']);
        break;

    default:
        json_response(['ok' => false, 'message' => 'Unknown API action.'], 404);
}
