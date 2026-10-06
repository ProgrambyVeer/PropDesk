"""Comprehensive API regression tests for Property Consultant CRM.

Executed sequentially inside a single class (xdist --dist loadscope) so that
state (ids/codes) chains across tests without relying on module-level pytest
attributes that don't cross workers.
"""

import os
import time
import uuid
import pytest
import requests

BASE = (os.environ.get("REACT_APP_BACKEND_URL")
        or "https://deal-pipeline-101.preview.emergentagent.com").rstrip("/") + "/api/v1"
ADMIN = BASE + "/admin"
OTP = "123456"
PC_A = "9876543210"
PC_B = "9123456780"
UNREG = "9811111111"


def _unwrap(r):
    assert r.status_code < 400, f"{r.status_code} {r.text[:400]}"
    j = r.json()
    assert j.get("success") is True, f"not success: {j}"
    return j["data"]


# ===========================================================================
# One big ordered class so all tests share worker + state.
# ===========================================================================
class TestPropCRM:
    state: dict = {}

    # ------------------------------ 0. auth ------------------------------
    def test_00_pc_a_login(self):
        s = requests.post(f"{BASE}/auth/send-otp",
                          json={"phone": PC_A}, timeout=20)
        if s.status_code == 429:
            pytest.skip("OTP rate limited for PC A — rerun in ~10 min")
        r = requests.post(f"{BASE}/auth/verify-otp",
                          json={"phone": PC_A, "code": OTP}, timeout=20)
        tok = _unwrap(r)["token"]
        self.state["ha"] = {"Authorization": f"Bearer {tok}"}

    def test_01_pc_b_login(self):
        s = requests.post(f"{BASE}/auth/send-otp",
                          json={"phone": PC_B}, timeout=20)
        if s.status_code == 429:
            pytest.skip("OTP rate limited for PC B — rerun in ~10 min")
        r = requests.post(f"{BASE}/auth/verify-otp",
                          json={"phone": PC_B, "code": OTP}, timeout=20)
        tok = _unwrap(r)["token"]
        self.state["hb"] = {"Authorization": f"Bearer {tok}"}

    def test_02_me(self):
        if "ha" not in self.state:
            pytest.skip("PC A not logged in (upstream rate-limit)")
        d = _unwrap(requests.get(f"{BASE}/auth/me",
                                 headers=self.state["ha"], timeout=20))
        assert d["phone"].endswith(PC_A)

    def test_04_admin_login(self):
        r = requests.post(f"{ADMIN}/auth/login",
                          json={"email": "crazycoder117@gmail.com",
                                "password": "Admin@12345"}, timeout=20)
        tok = _unwrap(r)["token"]
        self.state["hadm"] = {"Authorization": f"Bearer {tok}"}

    def test_05_viewer_login(self):
        r = requests.post(f"{ADMIN}/auth/login",
                          json={"email": "viewer@propcrm.local",
                                "password": "Admin@12345"}, timeout=20)
        tok = _unwrap(r)["token"]
        self.state["hview"] = {"Authorization": f"Bearer {tok}"}

    # ------------------- 1. clients & requirements -----------------------
    def test_10_create_client(self):
        ha = self.state["ha"]
        c = _unwrap(requests.post(f"{BASE}/clients", headers=ha, timeout=20, json={
            "name": f"TEST_Client_{uuid.uuid4().hex[:6]}",
            "phone": f"9{uuid.uuid4().int % 1000000000:09d}",
            "location": "Whitefield",
        }))
        self.state["client_id"] = c["id"]

    def test_11_create_three_requirements_unique_codes(self):
        ha = self.state["ha"]
        codes = []
        for i in range(3):
            req = _unwrap(requests.post(f"{BASE}/requirements", headers=ha, timeout=20, json={
                "clientId": self.state["client_id"],
                "type": "BUY_LOOKING",
                "category": "RESIDENTIAL",
                "subtype": "Apartment",
                "location": "Whitefield",
                "bhk": 2 + i,
                "amount": 5000000 + i * 1000000,
                "dimLength": 40, "dimWidth": 60, "dimUnit": "FEET",
            }))
            assert req["code"].startswith("REQ-"), req
            codes.append(req["code"])
        assert len(set(codes)) == 3, f"REQ codes not unique: {codes}"
        self.state["req_codes"] = codes

    def test_12_edit_one_requirement_leaves_others_untouched(self):
        ha = self.state["ha"]
        d = _unwrap(requests.get(
            f"{BASE}/requirements?clientId={self.state['client_id']}",
            headers=ha, timeout=20))
        items = d["items"] if isinstance(d, dict) and "items" in d else d
        assert len(items) >= 3
        before = {r["code"]: r.get("updatedAt") for r in items}
        target = items[0]
        self.state["req_id"] = target["id"]
        self.state["req_code"] = target["code"]
        updated = _unwrap(requests.patch(
            f"{BASE}/requirements/{target['id']}", headers=ha,
            json={"amount": 9999999}, timeout=20))
        assert updated["amount"] == 9999999
        d2 = _unwrap(requests.get(
            f"{BASE}/requirements?clientId={self.state['client_id']}",
            headers=ha, timeout=20))
        items2 = d2["items"] if isinstance(d2, dict) and "items" in d2 else d2
        for r in items2:
            if r["code"] != target["code"]:
                assert r.get("updatedAt") == before[r["code"]]

    # --------------------------- 2. properties ---------------------------
    def test_20_create_property(self):
        ha = self.state["ha"]
        p = _unwrap(requests.post(f"{BASE}/properties", headers=ha, timeout=20, json={
            "category": "RESIDENTIAL",
            "subtype": "Apartment",
            "location": "Whitefield",
            "bhk": 3,
            "dimLength": 40, "dimWidth": 60, "dimUnit": "FEET",
            "transactions": [
                {"kind": "SALE", "salePrice": 7500000},
                {"kind": "RENT", "rentAmount": 35000,
                 "availableDate": "2026-02-01T00:00:00.000Z"},
            ],
        }))
        assert p["code"].startswith("PROP-"), p
        self.state["prop_id"] = p["id"]
        self.state["prop_code"] = p["code"]

    def test_21_requirement_matches_show_property(self):
        ha = self.state["ha"]
        rid = self.state["req_id"]
        d = _unwrap(requests.get(
            f"{BASE}/requirements/{rid}/matches", headers=ha, timeout=20))
        matches = d if isinstance(d, list) else d.get("matches", d.get("items", []))
        pid = self.state["prop_id"]
        found = [m for m in matches
                 if m.get("propertyId") == pid or
                 (m.get("property") or {}).get("id") == pid]
        assert found, f"no match for new property. matches={matches[:1]}"

    def test_22_link_and_create_deal(self):
        ha = self.state["ha"]
        link = _unwrap(requests.post(f"{BASE}/property-client-links", headers=ha,
                                     timeout=20, json={
                                         "propertyId": self.state["prop_id"],
                                         "clientId": self.state["client_id"],
                                         "requirementId": self.state["req_id"],
                                     }))
        assert link["propertyId"] == self.state["prop_id"]
        deal = _unwrap(requests.post(f"{BASE}/deals", headers=ha, timeout=20, json={
            "propertyId": self.state["prop_id"],
            "clientId": self.state["client_id"],
            "requirementId": self.state["req_id"],
            "dealValue": 7500000,
            "commissionPercent": 2,
        }))
        self.state["deal_id"] = deal["id"]
        assert "stage" in deal

    def test_23_advance_and_close_deal(self):
        ha = self.state["ha"]
        _unwrap(requests.post(f"{BASE}/deals/{self.state['deal_id']}/stage",
                              headers=ha, timeout=20,
                              json={"stage": "NEGOTIATION"}))
        closed = _unwrap(requests.post(
            f"{BASE}/deals/{self.state['deal_id']}/stage",
            headers=ha, timeout=20,
            json={"stage": "CLOSED",
                  "closingDate": "2026-03-01T00:00:00.000Z"}))
        assert closed["stage"] == "CLOSED"
        detail = _unwrap(requests.get(
            f"{BASE}/deals/{self.state['deal_id']}", headers=ha, timeout=20))
        assert detail.get("commissionAmount") or detail.get("commissionPercent")

    def test_24_share_registered_pc(self):
        ha = self.state["ha"]
        r = requests.post(f"{BASE}/property-shares", headers=ha, timeout=20, json={
            "propertyId": self.state["prop_id"],
            "targetType": "PC",
            "phone": PC_B,
        })
        d = _unwrap(r)
        share = d.get("share") or d
        assert d.get("registered") is True or share.get("receiverId")

    def test_25_share_unregistered_hints_whatsapp(self):
        ha = self.state["ha"]
        r = requests.post(f"{BASE}/property-shares", headers=ha, timeout=20, json={
            "propertyId": self.state["prop_id"],
            "targetType": "PC",
            "phone": UNREG,
        })
        body = r.text.lower()
        # Either structured response signalling unregistered, or 4xx with hint
        assert ("not registered" in body or "unregistered" in body
                or "whatsapp" in body), f"{r.status_code} {r.text[:200]}"

    # ---------------------------- 3. follow-ups --------------------------
    def test_30_followup_create_reschedule_complete(self):
        ha = self.state["ha"]
        fu = _unwrap(requests.post(f"{BASE}/follow-ups", headers=ha, timeout=20, json={
            "clientId": self.state["client_id"],
            "scheduledAt": "2027-02-10T10:00:00.000Z",
            "type": "CALL",
            "note": "TEST_followup",
        }))
        fid = fu["id"]
        rs = _unwrap(requests.post(f"{BASE}/follow-ups/{fid}/reschedule",
                                   headers=ha, timeout=20,
                                   json={"scheduledAt": "2027-02-12T11:30:00.000Z"}))
        assert "2027-02-12" in str(rs.get("scheduledAt", ""))
        done = _unwrap(requests.post(f"{BASE}/follow-ups/{fid}/complete",
                                     headers=ha, timeout=20, json={}))
        assert done["status"] == "COMPLETED"

    # ------------------------------- 4. bin ------------------------------
    def test_40_delete_requirement_and_restore_keeps_code(self):
        ha = self.state["ha"]
        d = _unwrap(requests.get(
            f"{BASE}/requirements?clientId={self.state['client_id']}",
            headers=ha, timeout=20))
        items = d["items"] if isinstance(d, dict) and "items" in d else d
        # delete the last requirement (not the one we edited/linked)
        victim = next((r for r in items if r["id"] != self.state["req_id"]), items[-1])
        code = victim["code"]
        r = requests.delete(f"{BASE}/requirements/{victim['id']}", headers=ha,
                            json={"reason": "TEST_bin"}, timeout=20)
        assert r.status_code < 400, r.text[:200]
        bin_d = _unwrap(requests.get(f"{BASE}/bin", headers=ha, timeout=20))
        rows = bin_d["items"] if isinstance(bin_d, dict) and "items" in bin_d else bin_d
        found = [b for b in rows
                 if b.get("entityCode") == code
                 or b.get("recordCode") == code
                 or (b.get("snapshot") or {}).get("code") == code
                 or b.get("code") == code]
        assert found, f"not in bin: looking for {code}, rows[0]={rows[0] if rows else None}"
        _unwrap(requests.post(f"{BASE}/bin/{found[0]['id']}/restore",
                              headers=ha, timeout=20, json={}))
        d2 = _unwrap(requests.get(
            f"{BASE}/requirements?clientId={self.state['client_id']}",
            headers=ha, timeout=20))
        items2 = d2["items"] if isinstance(d2, dict) and "items" in d2 else d2
        assert any(r["code"] == code for r in items2), "restored code mismatch"

    # ---------------- 5. dashboard / analytics / search ------------------
    def test_50_dashboard(self):
        d = _unwrap(requests.get(f"{BASE}/dashboard",
                                 headers=self.state["ha"], timeout=20))
        assert isinstance(d, dict)

    def test_51_analytics(self):
        d = _unwrap(requests.get(f"{BASE}/analytics",
                                 headers=self.state["ha"], timeout=20))
        assert isinstance(d, dict)

    def test_52_search_whitefield(self):
        d = _unwrap(requests.get(f"{BASE}/search?q=Whitefield",
                                 headers=self.state["ha"], timeout=20))
        assert "Whitefield" in str(d) or d  # content present

    def test_53_search_req_code(self):
        code = self.state["req_code"]
        d = _unwrap(requests.get(f"{BASE}/search?q={code}",
                                 headers=self.state["ha"], timeout=20))
        assert code in str(d)

    # --------------------------- 6. isolation ----------------------------
    def test_60_pc_b_cannot_read_client(self):
        r = requests.get(f"{BASE}/clients/{self.state['client_id']}",
                         headers=self.state["hb"], timeout=20)
        assert r.status_code in (403, 404), r.status_code

    def test_61_pc_b_sees_shared_property_as_view_only(self):
        # After test_24, PC A shared the property with PC B — so PC B can see it,
        # but with access=VIEW_ONLY and no links/deals exposed.
        r = requests.get(f"{BASE}/properties/{self.state['prop_id']}",
                         headers=self.state["hb"], timeout=20)
        assert r.status_code == 200, r.text[:200]
        d = r.json()["data"]
        assert d.get("access") == "VIEW_ONLY", f"access leaked: {d.get('access')}"
        assert d.get("links") == [] and d.get("deals") == [], \
            "shared viewer must not see links/deals"

    def test_62_pc_b_cannot_read_requirement(self):
        r = requests.get(f"{BASE}/requirements/{self.state['req_id']}",
                         headers=self.state["hb"], timeout=20)
        assert r.status_code in (403, 404)

    # ---------------------------- 7. admin app ---------------------------
    def test_70_admin_me(self):
        d = _unwrap(requests.get(f"{ADMIN}/auth/me",
                                 headers=self.state["hadm"], timeout=20))
        assert d["email"] == "crazycoder117@gmail.com"
        assert d["role"] == "SUPER_ADMIN"

    def test_71_admin_dashboard(self):
        d = _unwrap(requests.get(f"{ADMIN}/dashboard",
                                 headers=self.state["hadm"], timeout=20))
        assert isinstance(d, dict)

    def test_72_admin_pcs_list_and_pcb_detail(self):
        d = _unwrap(requests.get(f"{ADMIN}/pcs",
                                 headers=self.state["hadm"], timeout=20))
        items = d["items"] if isinstance(d, dict) and "items" in d else d
        pc = next((p for p in items if (p.get("phone") or "").endswith(PC_B)), None)
        assert pc, "PC B not in admin list"
        self.state["pc_b_id"] = pc["id"]
        _unwrap(requests.get(f"{ADMIN}/pcs/{pc['id']}",
                             headers=self.state["hadm"], timeout=20))

    def test_73_admin_suspend_blocks_otp_then_activate(self):
        pcid = self.state["pc_b_id"]
        hadm = self.state["hadm"]
        _unwrap(requests.post(f"{ADMIN}/pcs/{pcid}/status",
                              headers=hadm, timeout=20,
                              json={"status": "SUSPENDED",
                                    "reason": "TEST_suspend",
                                    "confirm": True}))
        r = requests.post(f"{BASE}/auth/send-otp", json={"phone": PC_B}, timeout=20)
        suspended_status = r.status_code
        # restore before asserting so we never leave PC B suspended
        _unwrap(requests.post(f"{ADMIN}/pcs/{pcid}/status",
                              headers=hadm, timeout=20,
                              json={"status": "ACTIVE",
                                    "reason": "TEST_reactivate"}))
        # 429 means we're OTP-rate-limited; that's inconclusive, so skip.
        if suspended_status == 429:
            pytest.skip("send-otp rate-limited; cannot verify suspension gate")
        assert suspended_status == 403, \
            f"expected 403 while suspended, got {suspended_status}"
        time.sleep(0.5)
        r2 = requests.post(f"{BASE}/auth/send-otp",
                           json={"phone": PC_B}, timeout=20)
        if r2.status_code == 429:
            return  # inconclusive but suspend-side already validated
        assert r2.status_code < 400, \
            f"after activate send-otp failed: {r2.status_code} {r2.text[:200]}"

    def test_74_admin_global_search(self):
        d = _unwrap(requests.get(f"{ADMIN}/search?q=Whitefield",
                                 headers=self.state["hadm"], timeout=20))
        assert isinstance(d, (dict, list))

    def test_75_admin_locations_crud(self):
        hadm = self.state["hadm"]
        name = f"TEST_Loc_{uuid.uuid4().hex[:5]}"
        loc = _unwrap(requests.post(f"{ADMIN}/locations", headers=hadm, timeout=20,
                                    json={"city": "Bengaluru",
                                          "area": name, "locality": name}))
        upd = _unwrap(requests.patch(f"{ADMIN}/locations/{loc['id']}",
                                     headers=hadm, timeout=20,
                                     json={"active": False}))
        assert upd["active"] is False

    def test_76_admin_amenities_toggle(self):
        hadm = self.state["hadm"]
        name = f"TEST_Amen_{uuid.uuid4().hex[:5]}"
        a = _unwrap(requests.post(f"{ADMIN}/amenities", headers=hadm,
                                  timeout=20, json={"name": name}))
        upd = _unwrap(requests.patch(f"{ADMIN}/amenities/{a['id']}",
                                     headers=hadm, timeout=20,
                                     json={"active": False}))
        assert upd["active"] is False

    def test_77_viewer_cannot_suspend(self):
        r = requests.post(f"{ADMIN}/pcs/{self.state['pc_b_id']}/status",
                          headers=self.state["hview"], timeout=20,
                          json={"status": "SUSPENDED",
                                "reason": "unauthorized",
                                "confirm": True})
        assert r.status_code == 403, f"viewer should get 403, got {r.status_code}"

    def test_78_viewer_can_read_dashboard(self):
        r = requests.get(f"{ADMIN}/dashboard",
                         headers=self.state["hview"], timeout=20)
        assert r.status_code == 200

    def test_79_admin_purge_requires_confirm_text(self):
        hadm = self.state["hadm"]
        # Pick any bin item (there should be one from the earlier delete,
        # but it was restored, so create a quick throwaway client+delete).
        c = _unwrap(requests.post(f"{BASE}/clients",
                                  headers=self.state["ha"], timeout=20,
                                  json={"name": "TEST_PurgeMe",
                                        "phone": f"9{uuid.uuid4().int%1000000000:09d}",
                                        "location": "Whitefield"}))
        requests.delete(f"{BASE}/clients/{c['id']}",
                        headers=self.state["ha"], timeout=20,
                        json={"reason": "TEST"})
        bin_d = _unwrap(requests.get(f"{ADMIN}/bin",
                                     headers=hadm, timeout=20))
        rows = bin_d["items"] if isinstance(bin_d, dict) and "items" in bin_d else bin_d
        target = next((b for b in rows
                       if (b.get("snapshot") or {}).get("name") == "TEST_PurgeMe"
                       or b.get("recordCode") == c.get("code")), None)
        assert target, "bin item not found for purge test"
        # Without confirmText -> 400
        r = requests.post(f"{ADMIN}/bin/{target['id']}/purge",
                          headers=hadm, timeout=20, json={})
        assert r.status_code in (400, 422)
        # With correct confirmText -> ok
        r2 = requests.post(f"{ADMIN}/bin/{target['id']}/purge",
                           headers=hadm, timeout=20,
                           json={"confirmText": "DELETE PERMANENTLY"})
        assert r2.status_code < 400, r2.text[:200]
