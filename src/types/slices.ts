export type AppSlice = {
  walletAddress: string;
  personas: Persona[];
  isAppStarted: boolean;
};

export type Persona = {
  id: string;
  slug: string;
  name: string;
  description?: string;
  x_url?: string;
  pricing_per_min?: number;
  is_published: boolean;
  image_url?: string;
  model_uri?: string;
  system_prompt?: string;
  personality?: any;
  voice_id?: string;
  category?: string;
  vision_enabled?: boolean;
  vision_capture_interval?: number;
  meta?: any;
};

export type ModalSlice = {
  sessionEndedModal: {
    isOpen: boolean;
    data?: {
      title: string;
      description: string;
    } | null;
  };

  buyCreditModal: {
    isOpen: boolean;
    data?: {
      title: string;
      description: string;
    } | null;
  };
  authModal: {
    isOpen: boolean;
    mode?: authModalModes;
    data?: {
      title?: string;
      description?: string;
    } | null;
  };
  purchaseModal: {
    isOpen: boolean;
    mode?: "products" | "single-product";
    data?: {
      selectedProduct?: any;
      products?: any[];
    } | null;
  };
};

export type authModalModes =
  | "login"
  | "signup"
  | "magic-link"
  | "forgot-password";

export type ChatMessage = {
  id: string;
  text: string;
  sender: "user" | "avatar" | "separator";
  timestamp: number;
  type?:
  | "text"
  | "image";
  imageData?: {
    url: string;
    description?: string;
    status?: "generating" | "completed" | "failed";
  };
};

export type SessionSlice = {
  isCameraOn: boolean;
  isMicOn: boolean;
  isAvatarMuted: boolean;
  isChatOpen: boolean;
  isSessionEnded?: boolean;
  chatMessages: ChatMessage[];
  selectedAudioDeviceId?: string;
  selectedVideoDeviceId?: string;
};

export type ShowsSlice = {
  currentTab: ShowsTabs;
  streamingShow: Show | null;
};

export type Show = {
  id: number;
  title: string;
  description: string;
  date: string;
  reward: number;
  image: string;
  liveStatus: "past";
  url: string;
};

export type ShowsTabs = "Past" | "Upcoming";

export interface Pitch {
  id: string;
  session_id: string;
  user_id: string;
  avatar_id: string;
  video_url: string;
  thumbnail_url: string;
  duration_sec: number;
  file_size: string;
  is_published: boolean;
  created_at: string; // ISO date string
  updated_at: string; // ISO date string
  call_session_id: string;
  avatar_name: string;
  avatar_slug: string;
  avatar_image_url: string;
}

export interface User {
  id: string;
  privyUserId?: string;
  supabaseUserId?: string;
  wallet_address?: string;
  handle?: string;
  role: "user" | "admin" | string;
  credits: number;
  meta?: Record<string, any>;
  app_metadata?: Record<string, any>;
  user_metadata?: Record<string, any>;
  aud?: string;
  created_at: string;
  email?: string;
  phone?: string;
  pitches: Pitch[];
  pfp_url?: string;
}
