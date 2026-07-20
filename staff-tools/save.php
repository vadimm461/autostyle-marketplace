<?php

$data = file_get_contents("php://input");

file_put_contents(
"products.json",
$data
);

echo json_encode([
"success" => true
]);

?>
