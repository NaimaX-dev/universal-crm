<?php
// Used by api_test.php to fire a request from a separate process (for the concurrency test).
[$script, $url, $token, $json] = $argv;
$ctx = stream_context_create(['http' => ['method' => 'POST', 'header' => "Content-Type: application/json\r\nAuthorization: Bearer $token\r\n", 'content' => $json, 'ignore_errors' => true, 'timeout' => 30]]);
$body = file_get_contents($url, false, $ctx);
preg_match('#HTTP/\S+ (\d+)#', $http_response_header[0] ?? '', $m);
echo ($m[1] ?? '0') . "\n";
