import { createSlice, PayloadAction } from "@reduxjs/toolkit";
import { InteractionInput, Sentiment, SourceMode } from "@workspace/api-client-react";

interface InteractionState {
  draft: InteractionInput;
}

const initialState: InteractionState = {
  draft: {
    hcpId: null,
    hcpName: null,
    interactionType: null,
    interactionDate: null,
    interactionTime: null,
    attendees: [],
    topicsDiscussed: null,
    materialsShared: [],
    samplesDistributed: [],
    sentiment: null,
    outcomes: null,
    followUpActions: null,
    aiSummary: null,
    sourceMode: null,
  },
};

export const interactionSlice = createSlice({
  name: "interaction",
  initialState,
  reducers: {
    updateDraft: (state, action: PayloadAction<Partial<InteractionInput>>) => {
      state.draft = { ...state.draft, ...action.payload };
    },
    resetDraft: (state) => {
      state.draft = initialState.draft;
    },
  },
});

export const { updateDraft, resetDraft } = interactionSlice.actions;
export default interactionSlice.reducer;
