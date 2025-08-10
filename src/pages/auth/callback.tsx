import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';

export default function AuthCallback() {
  const navigate = useNavigate();
  const { login } = useAuth();

  useEffect(() => {
    const handleAuthCallback = async () => {
      try {
        // Get the session from the URL hash
        const { data, error } = await supabase.auth.getSession();
        
        if (error) {
          console.error('Auth callback error:', error);
          navigate('/?auth=error');
          return;
        }

        if (data.session) {
          console.log('Email confirmed, session established');
          // Redirect to home page with success message
          navigate('/?auth=confirmed');
        } else {
          console.log('No session found, redirecting to home');
          navigate('/');
        }
      } catch (error) {
        console.error('Auth callback error:', error);
        navigate('/?auth=error');
      }
    };

    handleAuthCallback();
  }, [navigate, login]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-900">
      <div className="text-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500 mx-auto mb-4"></div>
        <p className="text-white">Confirming your email...</p>
      </div>
    </div>
  );
}