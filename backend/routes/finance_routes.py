"""
ZOOR UP Finance, Invoicing & Supplier Routes
Persists Invoices, Expenses, and Suppliers to Supabase PostgreSQL with real business isolation.
"""
import uuid
from datetime import datetime
from typing import Any, Dict, List, Optional
from fastapi import APIRouter, HTTPException, status, Depends
from pydantic import BaseModel

from backend.database import get_collection
from backend.auth import get_current_user

router = APIRouter(tags=["Finance, Billing & Suppliers"])


def _get_business_for_user(current_user: dict) -> dict:
    biz_col = get_collection("businesses")
    biz_id = current_user.get("business_id")
    if not biz_id:
        biz = biz_col.find_one({"owner_id": current_user["id"]})
        if biz:
            return biz
        raise HTTPException(status_code=404, detail="No business associated with this account.")
    biz = biz_col.find_one({"id": biz_id}) or biz_col.find_one({"owner_id": current_user["id"]})
    if not biz:
        raise HTTPException(status_code=404, detail="Business not found.")
    return biz


# -----------------------------------------------------------------------------
# 1. BILLING & INVOICES
# -----------------------------------------------------------------------------
class CreateInvoiceRequest(BaseModel):
    business_id: Optional[str] = None
    order_id: Optional[str] = None
    customer_id: Optional[str] = None
    customer_name: Optional[str] = "Walk-in Customer"
    customer_phone: Optional[str] = None
    items: Optional[List[Dict[str, Any]]] = []
    subtotal: float
    taxRate: Optional[float] = 5.0
    tax_amount: Optional[float] = None
    discount_amount: Optional[float] = 0.0
    total_amount: Optional[float] = None
    payment_status: Optional[str] = "PAID"
    payment_mode: Optional[str] = "UPI"
    order_type: Optional[str] = "DINE_IN"
    table_id: Optional[str] = None
    table_number: Optional[str] = None
    due_date: Optional[str] = None
    notes: Optional[str] = None


class UpdateInvoiceStatusRequest(BaseModel):
    status: str


def _award_loyalty_for_invoice(inv: dict, biz_id: str):
    """Awards points to customer when invoice is paid."""
    phone = inv.get("customer_phone")
    cust_id = inv.get("customer_id")
    total = float(inv.get("total_amount") or inv.get("total") or 0)
    if total <= 0:
        return

    cust_col = get_collection("customers")
    customer = None
    if cust_id:
        customer = cust_col.find_one({"id": cust_id}) or cust_col.find_one({"customer_id": cust_id})
    if not customer and phone:
        customer = cust_col.find_one({"phone": phone})

    if customer:
        points_to_award = max(1, int(total // 10))
        loyalty_col = get_collection("loyalty")
        tx_col = get_collection("loyalty_transactions")
        real_cust_id = customer.get("customer_id") or customer["id"]

        loyalty = loyalty_col.find_one({"customer_id": real_cust_id, "business_id": biz_id})
        current_pts = float(loyalty.get("points") or 0) if loyalty else 0
        new_pts = current_pts + points_to_award

        loyalty_col.update_one(
            {"customer_id": real_cust_id, "business_id": biz_id},
            {"$set": {"points": new_pts, "updated_at": datetime.now().isoformat()},
             "$inc": {"total_spent": total, "visit_count": 1}},
            upsert=True
        )

        tx_col.insert_one({
            "customer_id": real_cust_id,
            "business_id": biz_id,
            "type": "points_earned",
            "amount": points_to_award,
            "balance_after": new_pts,
            "description": f"Invoice {inv.get('id', '')} payment",
            "reference_id": inv.get("id"),
            "created_at": datetime.now().isoformat()
        })


@router.get("/api/billing/invoices")
def get_invoices(
    status: Optional[str] = None,
    search: Optional[str] = None,
    invoice_id: Optional[str] = None,
    order_id: Optional[str] = None,
    current_user: dict = Depends(get_current_user)
):
    user_role = (current_user.get("role") or "").upper()
    invoices_col = get_collection("invoices")

    if user_role == ROLE_CUSTOMER:
        cust_id = current_user.get("customer_id") or current_user.get("id")
        user_id = current_user.get("id")
        phone = current_user.get("phone")

        customer_queries = [
            {"customer_id": cust_id},
            {"customer_id": user_id},
        ]
        if phone:
            customer_queries.append({"customer_phone": phone})

        query = {"$or": customer_queries}
        if invoice_id:
            query = {"id": invoice_id, **query}
        elif order_id:
            query = {"order_id": order_id, **query}

        all_invoices = invoices_col.find(query)
    else:
        biz = _get_business_for_user(current_user)
        biz_id = biz["id"]
        filters = {"business_id": biz_id}
        if invoice_id:
            filters["id"] = invoice_id
        elif order_id:
            filters["order_id"] = order_id
        all_invoices = invoices_col.find(filters)
        if not all_invoices:
            all_invoices = invoices_col.find({"store_id": biz_id})

    results = []
    for inv in all_invoices:
        if status and status != "ALL":
            if (inv.get("payment_status") or inv.get("status") or "").upper() != status.upper():
                continue
        if search:
            q = search.lower()
            c_name = str(inv.get("customer_name") or "").lower()
            c_phone = str(inv.get("customer_phone") or "").lower()
            inv_id = str(inv.get("id") or "").lower()
            if q not in c_name and q not in c_phone and q not in inv_id:
                continue
        results.append(inv)

    results.sort(key=lambda x: str(x.get("created_at") or ""), reverse=True)
    return {"invoices": results}


@router.get("/api/billing/invoices/{invoice_id}")
def get_invoice_by_id(invoice_id: str, current_user: dict = Depends(get_current_user)):
    invoices_col = get_collection("invoices")
    inv = invoices_col.find_one({"id": invoice_id}) or invoices_col.find_one({"order_id": invoice_id})
    if not inv:
        raise HTTPException(status_code=404, detail="Invoice not found.")

    user_role = (current_user.get("role") or "").upper()
    if user_role == ROLE_CUSTOMER:
        cust_id = current_user.get("customer_id") or current_user.get("id")
        if inv.get("customer_id") not in [cust_id, current_user.get("id")] and inv.get("customer_phone") != current_user.get("phone"):
            raise HTTPException(status_code=403, detail="Access denied to this invoice.")
    elif user_role in [ROLE_BUSINESS_OWNER, ROLE_STAFF]:
        biz = _get_business_for_user(current_user)
        if inv.get("business_id") != biz["id"] and inv.get("store_id") != biz["id"]:
            raise HTTPException(status_code=403, detail="Access denied to this invoice.")

    return inv


@router.post("/api/billing/invoices")
def create_invoice(req: CreateInvoiceRequest, current_user: dict = Depends(get_current_user)):
    user_role = (current_user.get("role") or "").upper()
    businesses_col = get_collection("businesses")

    if user_role == ROLE_CUSTOMER:
        biz_id = req.business_id
        if not biz_id and req.order_id:
            order = get_collection("orders").find_one({"id": req.order_id})
            if order:
                biz_id = order.get("business_id")
        if not biz_id:
            raise HTTPException(status_code=400, detail="Business ID is required.")
        biz = businesses_col.find_one({"id": biz_id}) or businesses_col.find_one({"slug": biz_id})
        if not biz:
            raise HTTPException(status_code=404, detail="Business not found.")
        biz_id = biz["id"]
        customer_id = req.customer_id or current_user.get("customer_id") or current_user.get("id")
    else:
        biz = _get_business_for_user(current_user)
        biz_id = biz["id"]
        customer_id = req.customer_id

    invoices_col = get_collection("invoices")

    new_id = f"INV-2026-{uuid.uuid4().hex[:6].upper()}"

    subtotal = float(req.subtotal)
    tax_rate = float(req.taxRate or 5.0)
    tax_amount = req.tax_amount if req.tax_amount is not None else round((subtotal * tax_rate) / 100.0, 2)
    discount_amount = float(req.discount_amount or 0.0)
    total_amount = req.total_amount if req.total_amount is not None else max(0.0, subtotal + tax_amount - discount_amount)
    now_iso = datetime.now().isoformat()

    invoice_doc = {
        "id": new_id,
        "business_id": biz_id,
        "store_id": biz_id,
        "order_id": req.order_id,
        "customer_id": customer_id,
        "customer_name": req.customer_name or "Walk-in Customer",
        "customer_phone": req.customer_phone or "",
        "items": req.items or [],
        "subtotal": subtotal,
        "tax_amount": tax_amount,
        "tax": tax_amount,
        "discount_amount": discount_amount,
        "discount": discount_amount,
        "total_amount": total_amount,
        "total": total_amount,
        "payment_status": (req.payment_status or "PAID").upper(),
        "status": "paid" if (req.payment_status or "PAID").upper() == "PAID" else "issued",
        "payment_mode": req.payment_mode or "UPI",
        "order_type": req.order_type or "DINE_IN",
        "table_id": req.table_id,
        "table_number": req.table_number,
        "due_date": req.due_date or datetime.now().strftime("%Y-%m-%d"),
        "notes": req.notes,
        "created_at": now_iso
    }

    invoices_col.insert_one(invoice_doc)

    if invoice_doc["payment_status"] == "PAID":
        try:
            _award_loyalty_for_invoice(invoice_doc, biz_id)
        except Exception:
            pass

    return {"success": True, "invoice": invoice_doc}


@router.patch("/api/billing/invoices/{invoice_id}/status")
def update_invoice_status(invoice_id: str, req: UpdateInvoiceStatusRequest, current_user: dict = Depends(get_current_user)):
    biz = _get_business_for_user(current_user)
    biz_id = biz["id"]
    invoices_col = get_collection("invoices")

    inv = invoices_col.find_one({"id": invoice_id, "business_id": biz_id}) or invoices_col.find_one({"id": invoice_id, "store_id": biz_id})
    if not inv:
        raise HTTPException(status_code=404, detail="Invoice not found.")

    prev_status = (inv.get("payment_status") or inv.get("status") or "").upper()
    new_status = req.status.upper()
    db_status = "paid" if new_status == "PAID" else ("cancelled" if new_status == "CANCELLED" else "issued")

    invoices_col.update_one(
        {"id": invoice_id},
        {"$set": {"payment_status": new_status, "status": db_status, "updated_at": datetime.now().isoformat()}}
    )

    if new_status == "PAID" and prev_status != "PAID":
        try:
            _award_loyalty_for_invoice(inv, biz_id)
        except Exception:
            pass

    updated = invoices_col.find_one({"id": invoice_id})
    return {"success": True, "invoice": updated}


# -----------------------------------------------------------------------------
# 2. EXPENSES
# -----------------------------------------------------------------------------
class ExpenseCreateRequest(BaseModel):
    category: Optional[str] = "Other"
    amount: float
    date: Optional[str] = None
    description: Optional[str] = ""
    receipt: Optional[str] = None


@router.get("/api/finance/expenses")
def get_expenses(
    category: Optional[str] = None,
    search: Optional[str] = None,
    current_user: dict = Depends(get_current_user)
):
    biz = _get_business_for_user(current_user)
    biz_id = biz["id"]
    expenses_col = get_collection("expenses")

    all_exp = expenses_col.find({"business_id": biz_id})
    if not all_exp:
        all_exp = expenses_col.find({"store_id": biz_id})

    results = []
    for e in all_exp:
        if category and category != "ALL":
            if (e.get("category") or "").lower() != category.lower():
                continue
        if search:
            q = search.lower()
            if q not in str(e.get("description") or "").lower():
                continue
        results.append(e)

    results.sort(key=lambda x: str(x.get("date") or x.get("created_at") or ""), reverse=True)
    return {"expenses": results}


@router.post("/api/finance/expenses")
def add_expense(req: ExpenseCreateRequest, current_user: dict = Depends(get_current_user)):
    biz = _get_business_for_user(current_user)
    biz_id = biz["id"]
    expenses_col = get_collection("expenses")

    new_id = str(uuid.uuid4())
    now_iso = datetime.now().isoformat()

    doc = {
        "id": new_id,
        "business_id": biz_id,
        "store_id": biz_id,
        "category": req.category or "Other",
        "amount": float(req.amount),
        "date": req.date or datetime.now().strftime("%Y-%m-%d"),
        "description": req.description or "",
        "receipt": req.receipt,
        "created_at": now_iso
    }
    expenses_col.insert_one(doc)
    return {"success": True, "expense": doc}


@router.delete("/api/finance/expenses/{expense_id}")
def delete_expense(expense_id: str, current_user: dict = Depends(get_current_user)):
    biz = _get_business_for_user(current_user)
    biz_id = biz["id"]
    expenses_col = get_collection("expenses")

    exp = expenses_col.find_one({"id": expense_id, "business_id": biz_id}) or expenses_col.find_one({"id": expense_id, "store_id": biz_id})
    if not exp:
        raise HTTPException(status_code=404, detail="Expense not found.")

    expenses_col.delete_one({"id": expense_id})
    return {"success": True, "message": "Expense deleted successfully."}


# -----------------------------------------------------------------------------
# 3. SUPPLIERS
# -----------------------------------------------------------------------------
class SupplierCreateRequest(BaseModel):
    name: str
    phone: Optional[str] = None
    email: Optional[str] = ""
    address: Optional[str] = ""
    products: Optional[str] = ""
    outstanding_payment: Optional[float] = 0.0


@router.get("/api/finance/suppliers")
def get_suppliers(current_user: dict = Depends(get_current_user)):
    biz = _get_business_for_user(current_user)
    biz_id = biz["id"]
    suppliers_col = get_collection("suppliers")

    all_sup = suppliers_col.find({"business_id": biz_id})
    if not all_sup:
        all_sup = suppliers_col.find({"store_id": biz_id})
    return {"suppliers": all_sup}


@router.post("/api/finance/suppliers")
def add_supplier(req: SupplierCreateRequest, current_user: dict = Depends(get_current_user)):
    biz = _get_business_for_user(current_user)
    biz_id = biz["id"]
    suppliers_col = get_collection("suppliers")

    new_id = str(uuid.uuid4())
    doc = {
        "id": new_id,
        "business_id": biz_id,
        "store_id": biz_id,
        "name": req.name,
        "phone": req.phone or "",
        "email": req.email or "",
        "address": req.address or "",
        "products": req.products or "",
        "outstanding_payment": float(req.outstanding_payment or 0.0),
        "created_at": datetime.now().isoformat()
    }
    suppliers_col.insert_one(doc)
    return {"success": True, "supplier": doc}


@router.delete("/api/finance/suppliers/{supplier_id}")
def delete_supplier(supplier_id: str, current_user: dict = Depends(get_current_user)):
    biz = _get_business_for_user(current_user)
    biz_id = biz["id"]
    suppliers_col = get_collection("suppliers")

    sup = suppliers_col.find_one({"id": supplier_id, "business_id": biz_id}) or suppliers_col.find_one({"id": supplier_id, "store_id": biz_id})
    if not sup:
        raise HTTPException(status_code=404, detail="Supplier not found.")

    suppliers_col.delete_one({"id": supplier_id})
    return {"success": True, "message": "Supplier deleted successfully."}
