import { createSlice, PayloadAction } from "@reduxjs/toolkit";
import { FollowUpSuggestion } from "@workspace/api-client-react";

export interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: number;
}

interface AgentState {
  messages: ChatMessage[];
  missingFields: string[];
  followUpSuggestions: FollowUpSuggestion[];
  toolTrace: string[];
  isTyping: boolean;
}

const initialState: AgentState = {
  messages: [],
  missingFields: [],
  followUpSuggestions: [],
  toolTrace: [],
  isTyping: false,
};

export const agentSlice = createSlice({
  name: "agent",
  initialState,
  reducers: {
    addMessage: (state, action: PayloadAction<Omit<ChatMessage, "id" | "timestamp">>) => {
      state.messages.push({
        ...action.payload,
        id: crypto.randomUUID(),
        timestamp: Date.now(),
      });
    },
    setTyping: (state, action: PayloadAction<boolean>) => {
      state.isTyping = action.payload;
    },
    setAgentContext: (
      state,
      action: PayloadAction<{ missingFields?: string[]; followUpSuggestions?: FollowUpSuggestion[]; toolTrace?: string[] }>
    ) => {
      if (action.payload.missingFields) state.missingFields = action.payload.missingFields;
      if (action.payload.followUpSuggestions) state.followUpSuggestions = action.payload.followUpSuggestions;
      if (action.payload.toolTrace) state.toolTrace = action.payload.toolTrace;
    },
    resetAgent: (state) => {
      state.messages = [];
      state.missingFields = [];
      state.followUpSuggestions = [];
      state.toolTrace = [];
      state.isTyping = false;
    },
  },
});

export const { addMessage, setTyping, setAgentContext, resetAgent } = agentSlice.actions;
export default agentSlice.reducer;
