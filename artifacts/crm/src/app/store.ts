import { configureStore } from "@reduxjs/toolkit";
import interactionReducer from "../features/interactionSlice";
import agentReducer from "../features/agentSlice";
import hcpReducer from "../features/hcpSlice";

export const store = configureStore({
  reducer: {
    interaction: interactionReducer,
    agent: agentReducer,
    hcp: hcpReducer,
  },
});

export type RootState = ReturnType<typeof store.getState>;
export type AppDispatch = typeof store.dispatch;
