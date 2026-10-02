# Approved staff identities

`approved_staff.csv` is the owner-confirmed active cashier roster for the V4
cutover. It contains no PIN, email, Auth UUID or legacy UUID. It is a reviewed
provisioning manifest, not an automatic production loader.

Employee-code convention:

- `K###`: Rumeli İskelesi cashier;
- `D###`: İskele Dondurma cashier;
- `M###`: organization management (provisioned separately).

The manifest is validated with:

```text
node --test identity-data/validate.test.mjs
```

Production provisioning remains a separately approved operation. Each person
gets an individual PIN through the Management Center/employee-provision flow;
PINs must never be put in this directory, chat, Git or the migration map.

The five legacy cashier identities are a different concern from the current
roster. The two still-active legacy people map to their real V4 profiles. The
remaining three legacy identities must map to inactive, no-login archival
profiles solely to preserve historical report attribution. They are not added
to this active roster and must not appear as selectable current employees.
