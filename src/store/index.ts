import appReducer from "@/store/slices/app";
import modalReducer from "@/store/slices/modal";
import sessionReducer from "@/store/slices/session";
import showsReducer from "@/store/slices/shows";
import pitchReducer from "@/store/slices/pitches";
import { combineReducers, configureStore } from "@reduxjs/toolkit";
import {
  TypedUseSelectorHook,
  useDispatch as useAppDispatch,
  useSelector as useAppSelector,
} from "react-redux";
import { persistReducer, persistStore } from "redux-persist";
import storage from "redux-persist/lib/storage";

// Define root reducer
const rootReducer = combineReducers({
  // Add your reducers here
  app: appReducer,
  modal: modalReducer,
  session: sessionReducer,
  shows: showsReducer,
  pitches: pitchReducer,
});

// Configure persist options
const persistConfig = {
  key: "root",
  storage,
  whitelist: [], // Add reducers you want to persist
};

const persistedReducer = persistReducer(persistConfig, rootReducer);

// Configure store
const store = configureStore({
  reducer: persistedReducer,
  middleware: (getDefaultMiddleware) =>
    getDefaultMiddleware({
      serializableCheck: {
        ignoredActions: ["persist/PERSIST", "persist/REHYDRATE"],
      },
    }),
});

const persistor = persistStore(store);
const { dispatch } = store;
export type RootState = ReturnType<typeof store.getState>;
export type AppDispatch = typeof store.dispatch;
const useDispatch = () => useAppDispatch<AppDispatch>();
const useSelector: TypedUseSelectorHook<RootState> = useAppSelector;

export { store, dispatch, persistor, useSelector, useDispatch };
