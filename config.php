<?php

return [
    'app_name' => '羽球臨打報名系統',
    'supabase_url' => getenv('SUPABASE_URL') ?: 'https://YOUR-PROJECT.supabase.co',
    'supabase_anon_key' => getenv('SUPABASE_ANON_KEY') ?: 'YOUR_SUPABASE_ANON_KEY',
    'supabase_service_role_key' => getenv('SUPABASE_SERVICE_ROLE_KEY') ?: 'YOUR_SUPABASE_SERVICE_ROLE_KEY',
    'currency' => 'NT$',
];
