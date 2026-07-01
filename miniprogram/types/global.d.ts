declare const wx: any;
declare const module: {
  exports: any;
};

declare function App(options: any): void;
declare function Page(options: any): void;
declare function getApp<T = any>(): T;
declare function getCurrentPages(): any[];
declare function require(path: string): any;

type AnyRecord = Record<string, any>;

interface WxEvent<Detail = AnyRecord, Dataset = AnyRecord> {
  detail: Detail;
  currentTarget: {
    dataset: Dataset;
  };
  target?: {
    dataset?: Dataset;
  };
}

interface TextInputDetail {
  value: string;
}

interface PickerChangeDetail {
  value: number[];
}

interface CloudState {
  space: AnyRecord | null;
  tasks: AnyRecord[];
  memories: AnyRecord[];
  syncCursor: number;
}

interface TaskLocation {
  source?: string;
  name?: string;
  address?: string;
  latitude?: number | string | null;
  longitude?: number | string | null;
  lat?: number | string | null;
  lng?: number | string | null;
  coordinateType?: string;
  poiId?: string;
}

interface TaskImageItem {
  fileID?: string;
  previewUrl?: string;
  url?: string;
  imageUrl?: string;
}

interface SyncEvent {
  v?: number;
  type?: string;
  entity?: string;
  entityId?: string;
  at?: number;
  payload?: AnyRecord;
}

interface Error {
  code?: any;
  errCode?: any;
  errMsg?: any;
  raw?: any;
}
