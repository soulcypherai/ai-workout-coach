import { PayloadAction, createSlice } from "@reduxjs/toolkit";

import type { ShowsSlice } from "@/types/slices";

// Initial state
const initialState: ShowsSlice = {
  currentTab: "Past",
  streamingShow: null,
};

// Create slice
export const showsSlice = createSlice({
  name: "session",
  initialState,
  reducers: {
    setCurrentTab: (state, action: PayloadAction<ShowsSlice["currentTab"]>) => {
      state.currentTab = action.payload;
    },
    setStreamingShow: (
      state,
      action: PayloadAction<ShowsSlice["streamingShow"]>,
    ) => {
      state.streamingShow = action.payload;
    },
  },
});

export const { setCurrentTab, setStreamingShow } = showsSlice.actions;
export default showsSlice.reducer;
