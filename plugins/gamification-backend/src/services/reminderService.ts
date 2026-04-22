import { NotAllowedError, NotFoundError } from '@backstage/errors';
import type {
  ReminderRepository,
  ReminderRow,
  ReminderWithViewerStateRow,
} from '../repositories/reminderRepository';

type ViewerReminderScope = {
  viewerSubjectRef: string;
  teamRefs: string[];
};

export class ReminderService {
  private readonly reminderRepo: ReminderRepository;

  constructor(options: { reminderRepo: ReminderRepository }) {
    this.reminderRepo = options.reminderRepo;
  }

  private buildViewerScope(params: {
    viewerSubjectRef: string;
    ownershipEntityRefs: string[];
  }): ViewerReminderScope {
    const viewerSubjectRef = params.viewerSubjectRef.trim();
    const teamRefs = [
      ...new Set(
        params.ownershipEntityRefs
          .map(ref => ref.trim())
          .filter(ref => ref !== viewerSubjectRef && ref.startsWith('group:')),
      ),
    ];

    return { viewerSubjectRef, teamRefs };
  }

  private canAccessReminder(
    reminder: ReminderRow,
    scope: ViewerReminderScope,
  ): boolean {
    if (reminder.target_subject_type === 'user') {
      return (
        reminder.target_subject_ref.toLocaleLowerCase('en-US') ===
        scope.viewerSubjectRef.toLocaleLowerCase('en-US')
      );
    }

    if (reminder.target_subject_type === 'team') {
      const targetRef = reminder.target_subject_ref.toLocaleLowerCase('en-US');
      return scope.teamRefs.some(
        ref => ref.toLocaleLowerCase('en-US') === targetRef,
      );
    }

    return false;
  }

  private async requireAccessibleReminder(
    reminderId: string,
    params: {
      viewerSubjectRef: string;
      ownershipEntityRefs: string[];
    },
  ): Promise<ViewerReminderScope> {
    const reminder = await this.reminderRepo.getReminderById(reminderId);
    if (!reminder) {
      throw new NotFoundError('Reminder not found');
    }

    const scope = this.buildViewerScope(params);
    if (!this.canAccessReminder(reminder, scope)) {
      throw new NotAllowedError(
        'You can only modify reminders for yourself or your ownership groups',
      );
    }

    return scope;
  }

  async listVisibleReminders(params: {
    viewerSubjectRef: string;
    ownershipEntityRefs: string[];
  }): Promise<ReminderWithViewerStateRow[]> {
    const scope = this.buildViewerScope(params);

    return this.reminderRepo.listVisibleRemindersForViewer(scope);
  }

  async dismissReminder(
    reminderId: string,
    params: {
      viewerSubjectRef: string;
      ownershipEntityRefs: string[];
    },
  ): Promise<void> {
    const scope = await this.requireAccessibleReminder(reminderId, params);

    await this.reminderRepo.dismissReminderForViewer(
      reminderId,
      scope.viewerSubjectRef,
    );
  }

  async disableReminder(
    reminderId: string,
    params: {
      viewerSubjectRef: string;
      ownershipEntityRefs: string[];
    },
  ): Promise<void> {
    const scope = await this.requireAccessibleReminder(reminderId, params);

    await this.reminderRepo.disableReminderForViewer(
      reminderId,
      scope.viewerSubjectRef,
    );
  }
}
