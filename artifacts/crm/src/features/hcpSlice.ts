import { createSlice, PayloadAction } from "@reduxjs/toolkit";
import { Hcp } from "@workspace/api-client-react";

interface HcpState {
  selectedHcp: Hcp | null;
}

const initialState: HcpState = {
  selectedHcp: null,
};

export const hcpSlice = createSlice({
  name: "hcp",
  initialState,
  reducers: {
    selectHcp: (state, action: PayloadAction<Hcp | null>) => {
      state.selectedHcp = action.payload;
    },
  },
});

export const { selectHcp } = hcpSlice.actions;
export default hcpSlice.reducer;
