import { useState, useEffect } from "react";
import { logError } from "@/lib/errorLogger";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";

const API_URL = import.meta.env.VITE_SERVER_URL || 'http://localhost:3005';

interface PricingSettings {
  credit_price: number;
  min_purchase: number;
  max_purchase: number;
}

const CreditPricing = () => {
  const [settings, setSettings] = useState<PricingSettings>({
    credit_price: 0.10,
    min_purchase: 10,
    max_purchase: 1000
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [hasChanges, setHasChanges] = useState(false);

  useEffect(() => {
    fetchSettings();
  }, []);

  const fetchSettings = async () => {
    try {
      setLoading(true);
      const response = await fetch(`${API_URL}/api/admin/settings/pricing`, {
        credentials: 'include',
      });

      if (response.ok) {
        const data = await response.json();
        setSettings(data);
        setHasChanges(false);
      } else {
        toast.error('Failed to fetch pricing settings');
      }
    } catch (error) {
      logError('Error fetching pricing settings', error, { section: 'admin_credit_pricing' });
      toast.error('Error fetching pricing settings');
    } finally {
      setLoading(false);
    }
  };

  const saveSettings = async () => {
    try {
      setSaving(true);
      const response = await fetch(`${API_URL}/api/admin/settings/pricing`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify(settings),
      });

      if (response.ok) {
        toast.success('Pricing settings updated successfully');
        setHasChanges(false);
      } else {
        const error = await response.json();
        toast.error(error.error || 'Failed to update pricing settings');
      }
    } catch (error) {
      logError('Error saving pricing settings', error, { section: 'admin_credit_pricing' });
      toast.error('Error saving pricing settings');
    } finally {
      setSaving(false);
    }
  };

  const handleInputChange = (field: keyof PricingSettings, value: number) => {
    setSettings(prev => ({
      ...prev,
      [field]: value
    }));
    setHasChanges(true);
  };

  if (loading) {
    return (
      <div className="bg-gray-800 p-6 rounded-lg">
        <div className="text-center text-gray-400">Loading pricing settings...</div>
      </div>
    );
  }

  return (
    <div className="bg-gray-800 p-6 rounded-lg space-y-6">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold text-white">Credit Pricing Settings</h3>
        {hasChanges && (
          <Button
            onClick={saveSettings}
            disabled={saving}
            className="bg-blue-600 hover:bg-blue-700"
          >
            {saving ? 'Saving...' : 'Save Changes'}
          </Button>
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div>
          <label className="block text-sm font-medium text-gray-300 mb-2">
            Price per Credit ($)
          </label>
          <Input
            type="number"
            step="0.01"
            min="0.01"
            value={settings.credit_price}
            onChange={(e) => handleInputChange('credit_price', parseFloat(e.target.value) || 0)}
            className="bg-gray-700 border-gray-600 text-white"
          />
          <p className="text-xs text-gray-400 mt-1">
            How much users pay per credit
          </p>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-300 mb-2">
            Minimum Purchase
          </label>
          <Input
            type="number"
            min="1"
            value={settings.min_purchase}
            onChange={(e) => handleInputChange('min_purchase', parseInt(e.target.value) || 0)}
            className="bg-gray-700 border-gray-600 text-white"
          />
          <p className="text-xs text-gray-400 mt-1">
            Minimum credits users can buy
          </p>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-300 mb-2">
            Maximum Purchase
          </label>
          <Input
            type="number"
            min="1"
            value={settings.max_purchase}
            onChange={(e) => handleInputChange('max_purchase', parseInt(e.target.value) || 0)}
            className="bg-gray-700 border-gray-600 text-white"
          />
          <p className="text-xs text-gray-400 mt-1">
            Maximum credits users can buy
          </p>
        </div>
      </div>

      {/* Preview Section */}
      <div className="border-t border-gray-700 pt-4">
        <h4 className="text-sm font-medium text-gray-300 mb-3">Preview</h4>
        <div className="bg-gray-700 p-4 rounded-lg">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
            <div>
              <span className="text-gray-400">Min Purchase:</span>
              <div className="text-white font-medium">
                {settings.min_purchase} credits = ${(settings.min_purchase * settings.credit_price).toFixed(2)}
              </div>
            </div>
            <div>
              <span className="text-gray-400">Example (100 credits):</span>
              <div className="text-white font-medium">
                100 credits = ${(100 * settings.credit_price).toFixed(2)}
              </div>
            </div>
            <div>
              <span className="text-gray-400">Max Purchase:</span>
              <div className="text-white font-medium">
                {settings.max_purchase} credits = ${(settings.max_purchase * settings.credit_price).toFixed(2)}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default CreditPricing; 