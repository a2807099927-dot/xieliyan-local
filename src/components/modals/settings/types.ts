// types
import type { Dispatch, ReactNode } from 'react';
import type { AiProvider, AppConfig } from '../../../types/ai';

export type TabId = 'ai' | 'style' | 'ui' | 'habit' | 'store' | 'logs' | 'agent';

export interface ProviderCardItem {
 value: AiProvider;
 title: string;
 endpoint?: string;
 icon?: ReactNode;
}

export type SettingsDraftSetter = Dispatch<React.SetStateAction<AppConfig | null>>;
