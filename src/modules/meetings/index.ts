/** Public API for the Meetings module. */

export type {
  MeetingRecord,
  MeetingListItem,
  MeetingAttendee,
  MeetingDecision,
  MeetingActionItem,
  MeetingActionItemStatus,
  MeetingDetail,
  CreateMeetingInput,
  UpdateMeetingInput,
  MeetingListFilters,
  AddAttendeeInput,
  CreateDecisionInput,
  UpdateDecisionInput,
  CreateActionItemInput,
  UpdateActionItemInput,
} from './domain/types';

export { createMeeting } from './application/create-meeting';
export { updateMeeting } from './application/update-meeting';
export {
  countMeetingsForOrg,
  listMeetingsForOrg,
  listMeetingsForProject,
  listMeetingsForWorkspace,
} from './application/list-meetings';
export { getMeetingDetailById } from './application/get-meeting-detail';
export {
  addAttendeeToMeeting,
  removeAttendeeFromMeeting,
  listAttendeesForMeeting,
} from './application/manage-attendees';
export {
  createMeetingDecision,
  updateMeetingDecision,
  deleteMeetingDecisionById,
} from './application/manage-decisions';
export {
  createMeetingActionItem,
  updateMeetingActionItem,
  toggleActionItemStatus,
  createTaskFromActionItem,
} from './application/manage-action-items';
