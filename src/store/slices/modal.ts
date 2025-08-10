import { createSlice } from "@reduxjs/toolkit";

import type { ModalSlice, authModalModes } from "@/types/slices";

// Initial state
const initialState: ModalSlice = {
  sessionEndedModal: {
    isOpen: false,
    data: null,
  },

  buyCreditModal: {
    isOpen: false,
    data: null,
  },

  authModal: {
    isOpen: false,
    mode: "login",
    data: null,
  },

  purchaseModal: {
    isOpen: false,
    mode: "products", // "products" | "single-product"
    data: null,
  },
};

// Create slice
export const modalSlice = createSlice({
  name: "modal",
  initialState,
  reducers: {
    setBuyCreditModal: (
      state,
      action: {
        payload: [boolean, { title: string; description: string }?];
      },
    ) => {
      const [isOpen, data] = action.payload;
      state.buyCreditModal.isOpen = isOpen;

      // If modal is closed, always clear data
      if (!isOpen) {
        state.buyCreditModal.data = null;
      } else {
        // Set data if provided, otherwise null
        state.buyCreditModal.data = data ?? null;
      }
    },
    setSessionEndModal: (
      state,
      action: {
        payload: [boolean, { title: string; description: string }?];
      },
    ) => {
      const [isOpen, data] = action.payload;
      state.sessionEndedModal.isOpen = isOpen;

      // If modal is closed, always clear data
      if (!isOpen) {
        state.sessionEndedModal.data = null;
      } else {
        // Set data if provided, otherwise null
        state.sessionEndedModal.data = data ?? null;
      }
    },
    setAuthModal: (
      state,
      action: {
        payload: [
          boolean,
          authModalModes?,
          { title?: string; description?: string }?,
        ];
      },
    ) => {
      const [isOpen, mode, data] = action.payload;
      state.authModal.isOpen = isOpen;

      if (mode) {
        state.authModal.mode = mode;
      } else {
        state.authModal.mode = "login";
      }
      // If modal is closed, always clear data
      if (!isOpen) {
        state.authModal.data = null;
      } else {
        // Set data if provided, otherwise null
        state.authModal.data = data ?? null;
      }
    },
    setAuthModalMode: (
      state,
      action: {
        payload: "login" | "signup" | "magic-link" | "forgot-password";
      },
    ) => {
      const mode = action.payload;
      state.authModal.mode = mode;
    },
    setPurchaseModal: (
      state,
      action: {
        payload: [
          boolean,
          ("products" | "single-product")?,
          { selectedProduct?: any; products?: any[] }?
        ];
      },
    ) => {
      const [isOpen, mode, data] = action.payload;
      state.purchaseModal.isOpen = isOpen;

      if (mode) {
        state.purchaseModal.mode = mode;
      } else {
        state.purchaseModal.mode = "products";
      }

      // If modal is closed, always clear data
      if (!isOpen) {
        state.purchaseModal.data = null;
      } else {
        // Set data if provided, otherwise null
        state.purchaseModal.data = data ?? null;
      }
    },
  },
});

export const {
  setBuyCreditModal,
  setSessionEndModal,
  setAuthModal,
  setAuthModalMode,
  setPurchaseModal,
} = modalSlice.actions;
export default modalSlice.reducer;
