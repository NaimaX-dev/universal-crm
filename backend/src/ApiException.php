<?php
declare(strict_types=1);
namespace App;

/** Thrown anywhere to stop the request with a clean JSON error. */
class ApiException extends \RuntimeException
{
    public function __construct(
        public int $status,
        string $message,
        public ?array $errors = null,
        public ?string $errCode = null,
        public mixed $data = null
    ) {
        parent::__construct($message);
    }

    public static function validation(array $errors, string $message = 'Please correct the highlighted fields.'): self
    {
        return new self(422, $message, $errors);
    }
}
