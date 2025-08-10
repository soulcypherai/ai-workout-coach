import { createSlice, PayloadAction } from "@reduxjs/toolkit";

import type { AppSlice } from "@/types/slices";

// Initial state
const initialState: AppSlice = {
  walletAddress: "",
  personas: [],
  isAppStarted: false,
};

// Create slice
export const appSlice = createSlice({
  name: "app",
  initialState,
  reducers: {
    setWalletAddress: (state, action) => {
      state.walletAddress = action.payload;
    },
    setPersonas: (state, action) => {
      state.personas = action.payload;
    },
    setIsAppStarted: (state, action: PayloadAction<boolean>) => {
        state.isAppStarted = action.payload;      
    },
  },
});

export const { setWalletAddress, setPersonas,setIsAppStarted } = appSlice.actions;
export default appSlice.reducer;
