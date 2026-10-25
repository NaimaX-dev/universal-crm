<?php
declare(strict_types=1);
namespace App;

/** A paginated list result: serialised as { data: [...], meta: { total, page, pageSize } }. */
final class Page
{
    public function __construct(public array $rows, public int $total, public int $page, public int $pageSize) {}
}
