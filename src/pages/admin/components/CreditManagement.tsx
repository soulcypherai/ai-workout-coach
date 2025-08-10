import { useState, useEffect } from "react";
import { logError } from "@/lib/errorLogger";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { 
  Search, 
  Plus,
  Minus,
  Eye, 
  Coins, 
  Users, 
  Activity,
  TrendingUp,
  DollarSign
} from "lucide-react";
import { toast } from "sonner";

const API_URL = import.meta.env.VITE_SERVER_URL || 'http://localhost:3005';

interface User {
  id: string;
  wallet_address: string;
  credits: number;
  created_at: string;
  total_sessions: number;
  total_credits_spent: number;
  handle?: string;
  email?: string;
  meta?: {
    profileImage?: string;
  };
  app_metadata?: Record<string, any>;
  user_metadata?: Record<string, any>;
  aud?: string;
}

interface CreditTransaction {
  id: string;
  type: string;
  amount: number;
  description: string;
  created_at: string;
  avatar_name?: string;
}

interface CreditStats {
  overview: {
    total_users: number;
    total_credits_in_system: number;
    avg_credits_per_user: number;
    total_sessions: number;
    total_credits_spent: number;
    total_transactions: number;
  };
  transactionTypes: {
    type: string;
    count: number;
    total_amount: number;
  }[];
}

const CreditManagement = () => {
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [stats, setStats] = useState<CreditStats | null>(null);
  
  // Credit adjustment modal state
  const [selectedUser, setSelectedUser] = useState<User | null>(null);
  const [adjustmentAmount, setAdjustmentAmount] = useState('');
  const [adjustmentDescription, setAdjustmentDescription] = useState('');
  const [showAdjustModal, setShowAdjustModal] = useState(false);
  
  // Transaction history modal state
  const [showHistoryModal, setShowHistoryModal] = useState(false);
  const [userTransactions, setUserTransactions] = useState<CreditTransaction[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);

  useEffect(() => {
    fetchUsers();
    fetchStats();
  }, [currentPage, searchTerm]);

  const fetchUsers = async () => {
    try {
      setLoading(true);
      const queryParams = new URLSearchParams({
        page: currentPage.toString(),
        limit: '20',
        search: searchTerm
      });

      const response = await fetch(`${API_URL}/api/admin/users/credits?${queryParams}`, {
        credentials: 'include',
      });

      if (response.ok) {
        const data = await response.json();
        setUsers(data.users);
        setTotalPages(data.pagination.pages);
      } else {
        toast.error('Failed to fetch users');
      }
    } catch (error) {
      logError('Error fetching users', error, { section: 'admin_credit_management' });
      toast.error('Error fetching users');
    } finally {
      setLoading(false);
    }
  };

  const fetchStats = async () => {
    try {
      const response = await fetch(`${API_URL}/api/admin/credits/stats`, {
        credentials: 'include',
      });

      if (response.ok) {
        const data = await response.json();
        setStats(data);
      }
    } catch (error) {
      logError('Error fetching credit stats', error, { section: 'admin_credit_management' });
    }
  };

  const fetchUserHistory = async (userId: string) => {
    try {
      setHistoryLoading(true);
      const response = await fetch(`${API_URL}/api/admin/users/${userId}/credits/history`, {
        credentials: 'include',
      });

      if (response.ok) {
        const data = await response.json();
        setUserTransactions(data.transactions);
      } else {
        toast.error('Failed to fetch transaction history');
      }
    } catch (error) {
      logError('Error fetching transaction history', error, { section: 'admin_credit_management' });
      toast.error('Error fetching transaction history');
    } finally {
      setHistoryLoading(false);
    }
  };

  const handleAdjustCredits = async () => {
    if (!selectedUser || !adjustmentAmount || !adjustmentDescription) {
      toast.error('Please fill in all fields');
      return;
    }

    const amount = parseInt(adjustmentAmount);
    if (isNaN(amount) || amount === 0) {
      toast.error('Please enter a valid amount');
      return;
    }

    try {
      const response = await fetch(`${API_URL}/api/admin/users/${selectedUser.id}/credits/adjust`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify({
          amount,
          description: adjustmentDescription,
        }),
      });

      if (response.ok) {
        const data = await response.json();
        toast.success(`Credits ${amount > 0 ? 'added' : 'deducted'} successfully`);
        
        // Update the user in the list
        setUsers(users.map(u => 
          u.id === selectedUser.id 
            ? { ...u, credits: data.newBalance }
            : u
        ));
        
        // Close modal and reset form
        setShowAdjustModal(false);
        setSelectedUser(null);
        setAdjustmentAmount('');
        setAdjustmentDescription('');
        
        // Refresh stats
        fetchStats();
      } else {
        const error = await response.json();
        toast.error(error.error || 'Failed to adjust credits');
      }
    } catch (error) {
      logError('Error adjusting credits', error, { section: 'admin_credit_management' });
      toast.error('Error adjusting credits');
    }
  };

  const openAdjustModal = (user: User) => {
    setSelectedUser(user);
    setAdjustmentAmount('10'); // Default to adding 10 credits
    setShowAdjustModal(true);
  };

  const openHistoryModal = (user: User) => {
    setSelectedUser(user);
    setShowHistoryModal(true);
    fetchUserHistory(user.id);
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleString();
  };

  const formatWalletAddress = (address: string | null) => {
    if (!address) return 'No wallet';
    return `${address.slice(0, 8)}...${address.slice(-6)}`;
  };

  return (
    <div className="space-y-6">
      {/* Stats Overview */}
      {stats && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
          <div className="bg-gray-800 p-4 rounded-lg">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-gray-400 text-sm">Total Users</p>
                <p className="text-2xl font-bold text-white">{stats.overview.total_users}</p>
              </div>
              <Users className="h-8 w-8 text-blue-500" />
            </div>
          </div>
          
          <div className="bg-gray-800 p-4 rounded-lg">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-gray-400 text-sm">Credits In System</p>
                <p className="text-2xl font-bold text-white">{stats.overview.total_credits_in_system?.toLocaleString()}</p>
              </div>
              <Coins className="h-8 w-8 text-yellow-500" />
            </div>
          </div>
          
          <div className="bg-gray-800 p-4 rounded-lg">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-gray-400 text-sm">Credits Spent</p>
                <p className="text-2xl font-bold text-white">{stats.overview.total_credits_spent?.toLocaleString()}</p>
              </div>
              <TrendingUp className="h-8 w-8 text-green-500" />
            </div>
          </div>
          
          <div className="bg-gray-800 p-4 rounded-lg">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-gray-400 text-sm">Avg Credits/User</p>
                <p className="text-2xl font-bold text-white">{Math.round(stats.overview.avg_credits_per_user || 0)}</p>
              </div>
              <Activity className="h-8 w-8 text-purple-500" />
            </div>
          </div>
        </div>
      )}

      {/* Search and Controls */}
      <div className="flex flex-col sm:flex-row gap-4 items-center justify-between">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 h-4 w-4" />
          <Input
            type="text"
            placeholder="Search by wallet address or email..."
            value={searchTerm}
            onChange={(e) => {
              setSearchTerm(e.target.value);
              setCurrentPage(1);
            }}
            className="pl-10 bg-gray-800 border-gray-700 text-white"
          />
        </div>
        
        <div className="text-sm text-gray-400">
          Page {currentPage} of {totalPages}
        </div>
      </div>

      {/* Users Table */}
      <div className="bg-gray-800 rounded-lg overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead className="bg-gray-700">
              <tr>
                <th className="px-4 py-3 text-gray-300 font-medium">Wallet Address</th>
                <th className="px-4 py-3 text-gray-300 font-medium">Email</th>
                <th className="px-4 py-3 text-gray-300 font-medium">Credits</th>
                <th className="px-4 py-3 text-gray-300 font-medium">Sessions</th>
                <th className="px-4 py-3 text-gray-300 font-medium">Credits Spent</th>
                <th className="px-4 py-3 text-gray-300 font-medium">Joined</th>
                <th className="px-4 py-3 text-gray-300 font-medium">Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={7} className="px-4 py-8 text-center text-gray-400">
                    Loading users...
                  </td>
                </tr>
              ) : users.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-4 py-8 text-center text-gray-400">
                    No users found
                  </td>
                </tr>
              ) : (
                users.map((user) => (
                  <tr key={user.id} className="border-t border-gray-700 hover:bg-gray-750">
                    <td className="px-4 py-3 text-white font-mono text-sm">
                      {formatWalletAddress(user.wallet_address)}
                    </td>
                    <td className="px-4 py-3 text-gray-300 text-sm">
                      {user.email || 'N/A'}
                    </td>
                    <td className="px-4 py-3">
                      <span className="text-yellow-400 font-semibold">
                        {user.credits} credits
                      </span>
                    </td>
                    <td className="px-4 py-3 text-gray-300">
                      {user.total_sessions}
                    </td>
                    <td className="px-4 py-3 text-gray-300">
                      {user.total_credits_spent}
                    </td>
                    <td className="px-4 py-3 text-gray-300 text-sm">
                      {formatDate(user.created_at)}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex gap-2">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => openAdjustModal(user)}
                          className="text-blue-400 border-blue-400 hover:bg-blue-400 hover:text-white"
                        >
                          <DollarSign className="h-4 w-4" />
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => openHistoryModal(user)}
                          className="text-green-400 border-green-400 hover:bg-green-400 hover:text-white"
                        >
                          <Eye className="h-4 w-4" />
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex justify-center gap-2">
          <Button
            variant="outline"
            disabled={currentPage === 1}
            onClick={() => setCurrentPage(currentPage - 1)}
            className="text-gray-300 border-gray-600"
          >
            Previous
          </Button>
          <Button
            variant="outline"
            disabled={currentPage === totalPages}
            onClick={() => setCurrentPage(currentPage + 1)}
            className="text-gray-300 border-gray-600"
          >
            Next
          </Button>
        </div>
      )}

      {/* Credit Adjustment Modal */}
      {showAdjustModal && selectedUser && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-gray-800 p-6 rounded-lg w-full max-w-md">
            <h3 className="text-lg font-semibold text-white mb-4">
              Adjust Credits for {formatWalletAddress(selectedUser.wallet_address)}
            </h3>
            <p className="text-gray-400 text-sm mb-4">
              Current balance: {selectedUser.credits} credits
            </p>
            
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-1">
                  Amount
                </label>
                <div className="flex gap-2">
                  <Input
                    type="number"
                    value={Math.abs(parseInt(adjustmentAmount) || 0).toString()}
                    onChange={(e) => {
                      const value = e.target.value;
                      const isNegative = parseInt(adjustmentAmount) < 0;
                      setAdjustmentAmount(isNegative ? `-${value}` : value);
                    }}
                    placeholder="100"
                    className="bg-gray-700 border-gray-600 text-white flex-1"
                  />
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => {
                      const value = Math.abs(parseInt(adjustmentAmount) || 0);
                      setAdjustmentAmount(value.toString());
                    }}
                    className={`${parseInt(adjustmentAmount) >= 0 ? 'bg-green-600 text-white' : 'text-green-400 border-green-400'}`}
                  >
                    <Plus className="h-4 w-4" />
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => {
                      const value = Math.abs(parseInt(adjustmentAmount) || 0);
                      setAdjustmentAmount(`-${value}`);
                    }}
                    className={`${parseInt(adjustmentAmount) < 0 ? 'bg-red-600 text-white' : 'text-red-400 border-red-400'}`}
                  >
                    <Minus className="h-4 w-4" />
                  </Button>
                </div>
                <p className="text-xs text-gray-400 mt-1">
                  {parseInt(adjustmentAmount) >= 0 ? 'Adding credits' : 'Removing credits'}
                </p>
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-1">
                  Description
                </label>
                <Input
                  type="text"
                  value={adjustmentDescription}
                  onChange={(e) => setAdjustmentDescription(e.target.value)}
                  placeholder="Reason for adjustment"
                  className="bg-gray-700 border-gray-600 text-white"
                />
              </div>
            </div>
            
            <div className="flex gap-2 mt-6">
              <Button
                onClick={handleAdjustCredits}
                className="flex-1 bg-blue-600 hover:bg-blue-700"
              >
                Adjust Credits
              </Button>
              <Button
                variant="outline"
                onClick={() => {
                  setShowAdjustModal(false);
                  setSelectedUser(null);
                  setAdjustmentAmount('');
                  setAdjustmentDescription('');
                }}
                className="flex-1 text-gray-300 border-gray-600"
              >
                Cancel
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Transaction History Modal */}
      {showHistoryModal && selectedUser && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-gray-800 p-6 rounded-lg w-full max-w-4xl max-h-[80vh] overflow-hidden">
            <h3 className="text-lg font-semibold text-white mb-4">
              Credit History for {formatWalletAddress(selectedUser.wallet_address)}
            </h3>
            
            <div className="overflow-y-auto max-h-96">
              {historyLoading ? (
                <div className="text-center py-8 text-gray-400">Loading history...</div>
              ) : userTransactions.length === 0 ? (
                <div className="text-center py-8 text-gray-400">No transactions found</div>
              ) : (
                <table className="w-full text-left">
                  <thead className="bg-gray-700 sticky top-0">
                    <tr>
                      <th className="px-4 py-3 text-gray-300 font-medium">Date</th>
                      <th className="px-4 py-3 text-gray-300 font-medium">Type</th>
                      <th className="px-4 py-3 text-gray-300 font-medium">Amount</th>
                      <th className="px-4 py-3 text-gray-300 font-medium">Description</th>
                    </tr>
                  </thead>
                  <tbody>
                    {userTransactions.map((transaction) => (
                      <tr key={transaction.id} className="border-t border-gray-700">
                        <td className="px-4 py-3 text-gray-300 text-sm">
                          {formatDate(transaction.created_at)}
                        </td>
                        <td className="px-4 py-3">
                          <span className={`px-2 py-1 rounded text-xs font-medium ${
                            transaction.type === 'purchase' ? 'bg-green-900 text-green-300' :
                            transaction.type === 'spend' ? 'bg-red-900 text-red-300' :
                            transaction.type === 'bonus' ? 'bg-blue-900 text-blue-300' :
                            'bg-gray-700 text-gray-300'
                          }`}>
                            {transaction.type}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <span className={`font-semibold ${
                            transaction.amount > 0 ? 'text-green-400' : 'text-red-400'
                          }`}>
                            {transaction.amount > 0 ? '+' : ''}{transaction.amount}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-gray-300 text-sm">
                          {transaction.description}
                          {transaction.avatar_name && (
                            <span className="text-gray-500"> ({transaction.avatar_name})</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
            
            <div className="mt-4 flex justify-end">
              <Button
                variant="outline"
                onClick={() => {
                  setShowHistoryModal(false);
                  setSelectedUser(null);
                  setUserTransactions([]);
                }}
                className="text-gray-300 border-gray-600"
              >
                Close
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default CreditManagement; 