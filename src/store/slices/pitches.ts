import { createSlice, PayloadAction } from "@reduxjs/toolkit";
import type { Pitch } from "@/types/slices";

type PitchState = Pitch[] ;

const initialState: PitchState = [];

export const pitchSlice = createSlice({
  name: "pitches",
  initialState,
  reducers: {
    setPitches: (_state: PitchState, action: PayloadAction<Pitch[]>) => action.payload,
    setPitchVisibility: (
      state: PitchState,
      action: PayloadAction<{ id: string; visibility: "public" | "private" }>
    ) => {
      if (!state) return;
      const { id, visibility } = action.payload;
      const pitch = state.find((p) => p.id === id);
      if (pitch) {
        pitch.is_published = visibility === "public";
      }
    },
  },
});

export const { setPitches, setPitchVisibility } = pitchSlice.actions;
export default pitchSlice.reducer;
