export type RootStackParamList = {
  Home: undefined;
  Users: undefined;
  Activities: undefined;
  ManualEntry: undefined;
  Timesheet: undefined;
  EntryEdit: { entryId: string };
  Reports: undefined;
  PersonDetail: { uid: string; displayName: string };
};
