import React, { useState, useEffect } from 'react';
import {
  TrendingDown,
  Plus,
  Trash2,
  Calendar,
  IndianRupee,
  FileText,
  PieChart
} from 'lucide-react';
import { financeService, EXPENSE_CATEGORIES } from '../../services/financeService';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';
import { Select } from '../../components/ui/Select';
import { Table } from '../../components/ui/Table';
import { Badge } from '../../components/ui/Badge';
import { Modal } from '../../components/ui/Modal';
import { SearchBar, Tabs } from '../../components/ui/Controls';
import { LoadingState } from '../../components/ui/States';
import { useToast } from '../../context/ToastContext';
import { useAuth } from '../../context/AuthContext';

export const ExpensesManagement = () => {
  const { user } = useAuth();
  const { addToast } = useToast();
  const [expenses, setExpenses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [categoryFilter, setCategoryFilter] = useState('ALL');
  const [search, setSearch] = useState('');
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);

  const [formData, setFormData] = useState({
    category: 'Rent',
    amount: '',
    date: new Date().toISOString().split('T')[0],
    description: '',
  });

  const bizId = user?.business_id;

  useEffect(() => {
    loadExpenses();
  }, [bizId, categoryFilter, search]);

  const loadExpenses = async () => {
    setLoading(true);
    try {
      const data = await financeService.getExpenses(bizId, {
        category: categoryFilter,
        search,
      });
      setExpenses(data);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  const handleAddExpense = async (e) => {
    e.preventDefault();
    if (!formData.amount) {
      addToast('Amount is required', 'error');
      return;
    }
    try {
      await financeService.addExpense(bizId, formData);
      addToast('Expense recorded successfully!', 'success');
      setIsAddModalOpen(false);
      setFormData({
        category: 'Rent',
        amount: '',
        date: new Date().toISOString().split('T')[0],
        description: '',
      });
      loadExpenses();
    } catch (e) {
      addToast('Error saving expense', 'error');
    }
  };

  const handleDelete = async (id) => {
    try {
      await financeService.deleteExpense(id);
      addToast('Expense deleted', 'success');
      loadExpenses();
    } catch (e) {
      addToast('Failed to delete expense', 'error');
    }
  };

  const totalExpenseAmount = expenses.reduce((sum, e) => sum + Number(e.amount), 0);

  const columns = [
    {
      header: 'Category',
      accessor: 'category',
      render: (cat) => <Badge variant="neutral">{cat}</Badge>,
    },
    {
      header: 'Description',
      accessor: 'description',
      render: (desc) => <span style={{ fontWeight: 500 }}>{desc || 'No description'}</span>,
    },
    {
      header: 'Date',
      accessor: 'date',
      render: (date) => <span style={{ fontSize: '0.85rem' }}>{date}</span>,
    },
    {
      header: 'Amount (₹)',
      accessor: 'amount',
      render: (amt) => (
        <strong style={{ color: 'var(--accent-rose)', fontSize: '0.95rem' }}>
          -₹{Number(amt).toLocaleString()}
        </strong>
      ),
    },
    {
      header: 'Actions',
      accessor: 'id',
      align: 'right',
      render: (id) => (
        <Button variant="ghost" size="sm" onClick={() => handleDelete(id)}>
          <Trash2 size={15} className="text-rose-400" />
        </Button>
      ),
    },
  ];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem' }}>
        <div>
          <h2 style={{ fontSize: '1.4rem', fontWeight: 800 }}>Expense Tracker & Outflows</h2>
          <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem' }}>
            Record store rent, payroll, electricity, supplies, and marketing to monitor true net profit.
          </p>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
          <div style={{ textAlign: 'right' }}>
            <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Filtered Total:</span>
            <div style={{ fontWeight: 800, fontSize: '1.2rem', color: 'var(--accent-rose)' }}>
              ₹{totalExpenseAmount.toLocaleString()}
            </div>
          </div>
          <Button variant="primary" icon={Plus} onClick={() => setIsAddModalOpen(true)}>
            Record Expense
          </Button>
        </div>
      </div>

      <Tabs
        activeTab={categoryFilter}
        onChange={setCategoryFilter}
        tabs={[{ id: 'ALL', label: 'All Categories' }, ...EXPENSE_CATEGORIES.map((c) => ({ id: c, label: c }))]}
      />

      <SearchBar
        value={search}
        onChange={setSearch}
        placeholder="Search expenses by vendor or description..."
      />

      {loading ? (
        <LoadingState message="Loading financial logs..." />
      ) : (
        <Table columns={columns} data={expenses} />
      )}

      {/* Add Expense Modal */}
      <Modal
        isOpen={isAddModalOpen}
        onClose={() => setIsAddModalOpen(false)}
        title="Record Operating Expense"
        footer={
          <>
            <Button variant="secondary" onClick={() => setIsAddModalOpen(false)}>
              Cancel
            </Button>
            <Button variant="primary" onClick={handleAddExpense}>
              Save Expense
            </Button>
          </>
        }
      >
        <form onSubmit={handleAddExpense} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          <div className="grid-2">
            <Select
              label="Expense Category"
              value={formData.category}
              onChange={(e) => setFormData({ ...formData, category: e.target.value })}
              options={EXPENSE_CATEGORIES}
            />
            <Input
              label="Amount (₹)"
              type="number"
              required
              value={formData.amount}
              onChange={(e) => setFormData({ ...formData, amount: e.target.value })}
              placeholder="e.g. 5000"
            />
          </div>

          <Input
            label="Expense Date"
            type="date"
            value={formData.date}
            onChange={(e) => setFormData({ ...formData, date: e.target.value })}
          />

          <div className="form-group">
            <label className="form-label">Description / Remarks</label>
            <textarea
              rows={3}
              className="form-textarea"
              value={formData.description}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              placeholder="e.g. BESCOM commercial electricity bill, Indiranagar showroom..."
            />
          </div>
        </form>
      </Modal>
    </div>
  );
};
