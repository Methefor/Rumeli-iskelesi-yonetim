-- Cashiers and employees record physical deliveries for their own assigned
-- branch. record_inventory_receipt already enforces branch scope and keeps
-- unit-cost changes behind the separate inventory.cost.manage permission.
--
-- Rollback:
-- delete from public.role_permissions rp
-- using public.roles r, public.permissions p
-- where rp.role_id = r.id and rp.permission_id = p.id
--   and r.key in ('cashier', 'employee') and p.key = 'inventory.receive';

insert into public.role_permissions (role_id, permission_id)
select r.id, p.id
from public.roles r
cross join public.permissions p
where r.key in ('cashier', 'employee')
  and p.key = 'inventory.receive'
on conflict do nothing;
