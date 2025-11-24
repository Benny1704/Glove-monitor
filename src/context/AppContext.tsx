import React, { createContext, useContext, useReducer, type ReactNode } from 'react';
import type { Record } from '../types';

interface AppState {
  records: Record[];
  isOnline: boolean;
  isSyncing: boolean;
  storageWarning: boolean;
}

type AppAction =
  | { type: 'SET_RECORDS'; payload: Record[] }
  | { type: 'ADD_RECORD'; payload: Record }
  | { type: 'UPDATE_RECORD'; payload: Record }
  | { type: 'DELETE_RECORD'; payload: string }
  | { type: 'SET_ONLINE'; payload: boolean }
  | { type: 'SET_SYNCING'; payload: boolean }
  | { type: 'SET_STORAGE_WARNING'; payload: boolean };

const initialState: AppState = {
  records: [],
  isOnline: navigator.onLine,
  isSyncing: false,
  storageWarning: false,
};

const AppContext = createContext<{
  state: AppState;
  dispatch: React.Dispatch<AppAction>;
} | undefined>(undefined);

function appReducer(state: AppState, action: AppAction): AppState {
  switch (action.type) {
    case 'SET_RECORDS':
      return { ...state, records: action.payload };
      
    case 'ADD_RECORD':
      return { ...state, records: [action.payload, ...state.records] };
      
    case 'UPDATE_RECORD':
      return {
        ...state,
        records: state.records.map((r) =>
          r.id === action.payload.id ? action.payload : r
        ),
      };
      
    case 'DELETE_RECORD':
      return {
        ...state,
        records: state.records.filter((r) => r.id !== action.payload),
      };
      
    case 'SET_ONLINE':
      return { ...state, isOnline: action.payload };
      
    case 'SET_SYNCING':
      return { ...state, isSyncing: action.payload };
      
    case 'SET_STORAGE_WARNING':
      return { ...state, storageWarning: action.payload };
      
    default:
      return state;
  }
}

export const AppProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [state, dispatch] = useReducer(appReducer, initialState);

  return (
    <AppContext.Provider value={{ state, dispatch }}>
      {children}
    </AppContext.Provider>
  );
};

export const useAppContext = () => {
  const context = useContext(AppContext);
  if (!context) {
    throw new Error('useAppContext must be used within AppProvider');
  }
  return context;
};