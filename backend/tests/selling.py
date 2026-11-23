"""Shared steps for selling tests."""

from itertools import count

from tests.conftest import ADMIN_PASSWORD

_keys = count(1)
REASON = {"reason": "mistake", "password": ADMIN_PASSWORD}


def key():
    return f"idempotency-key-{next(_keys):06d}"


def items(pos, **quantities):
    return [{"product_id": pos.p[n], "qty": q} for n, q in quantities.items()]


def save(pos, order, lines, **more):
    body = {"version": order["version"], "type": order["type"], "items": lines} | more
    return pos.put(f"/orders/{order['id']}", body)


def takeaway(pos, **quantities):
    return save(pos, pos.post("/orders", {"type": "takeaway"}), items(pos, **quantities))


WHO = {"customer": "Ali", "phone": "03", "address": "Hermel", "driver": "Mo"}


def delivery(pos, who=WHO, **quantities):
    order = pos.post("/orders", {"type": "delivery"})
    return save(pos, order, items(pos, **quantities), delivery=who)


def table(pos, no, **quantities):
    order = pos.post(f"/tables/{no}/order")
    return save(pos, order, items(pos, **quantities)) if quantities else order


def confirm(pos, order):
    body = {"version": order["version"], "expected_total": order["total"]}
    return pos.post(f"/orders/{order['id']}/confirm", body)


def payment(order, usd=0, lbp=0, change_usd=0, change_lbp=0, **more):
    return {
        "idempotency_key": key(),
        "version": order["version"],
        "expected_due": order["due"],
        "usd_cents": usd,
        "lbp": lbp,
        "change_usd_cents": change_usd,
        "change_lbp": change_lbp,
    } | more


def pay(pos, order, *args, **kw):
    return pos.post(f"/orders/{order['id']}/payments", payment(order, *args, **kw))


def pay_fails(pos, order, *args, **kw):
    return pos.fails("POST", f"/orders/{order['id']}/payments", payment(order, *args, **kw))


def rows(pos, sql):
    from sqlalchemy import text

    with pos.db.transaction() as db:
        return [tuple(r) for r in db.execute(text(sql))]


def promo(shop, **more):
    """Created by Admin while the cashier keeps the shift."""
    token = shop.token
    from app.modules.promos import service
    from app.modules.promos.schemas import PromoIn
    from app.modules.users.service import active_admins

    with shop.db.transaction() as db:
        data = PromoIn(**({"code": "GYROS10", "percent": 10} | more))
        admin = active_admins(db)[0].id
        existing = [p for p in service.all_promos(db) if p["code"] == data.code]
        service.save(db, admin, data, existing[0]["id"] if existing else None)
    shop.token = token


def with_promo(shop, order, code="gyros10"):
    body = {"version": order["version"], "code": code}
    return shop.put(f"/orders/{order['id']}/promo", body)
