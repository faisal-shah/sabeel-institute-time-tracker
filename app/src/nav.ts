export type RootStackParamList = {
  Home: undefined;
  Users: undefined;
  Activities: undefined;
  /** forUid/forName: log hours on someone else's behalf (manager/approver flow). */
  ManualEntry: { forUid?: string; forName?: string } | undefined;
  Timesheet: undefined;
  EntryEdit: { entryId: string };
  Reports: undefined;
  PersonDetail: { uid: string; displayName: string };
  Approvals: undefined;
  /** Approver review of one person's period. */
  TimesheetReview: { uid: string; displayName: string; periodKey: string };
};
