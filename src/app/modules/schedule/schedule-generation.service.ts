import { Schedule } from "./schedule.model";
import { Doctor } from "../doctor/doctor.model";

export interface ScheduleTemplate {
  startTime: string;
  endTime: string;
  maxAppointments: number;
  isAvailable: boolean;
}

export interface DoctorSchedulePreferences {
  workingHours: {
    start: string; // "09:00"
    end: string; // "17:00"
  };
  slotDuration: number; // in minutes, default 60
  maxAppointmentsPerSlot: number; // default 2
  workingDays: string[]; // ["monday", "tuesday", ...]
  excludeWeekends: boolean;
}

export class ScheduleGenerationService {
  private static readonly DEFAULT_PREFERENCES: DoctorSchedulePreferences = {
    workingHours: {
      start: "09:00",
      end: "17:00",
    },
    slotDuration: 60,
    maxAppointmentsPerSlot: 2,
    workingDays: ["monday", "tuesday", "wednesday", "thursday", "friday"],
    excludeWeekends: true,
  };

  /**
   * Generate initial schedules for a new doctor (next 30 days)
   */
  static async generateInitialSchedules(doctorId: string): Promise<void> {
    try {
      console.log(`Generating initial schedules for doctor: ${doctorId}`);

      const schedules = [];
      const today = new Date();

      // Generate schedules for next 30 days
      for (let i = 1; i <= 30; i++) {
        const date = new Date(today);
        date.setDate(today.getDate() + i);

        // Skip weekends if configured
        const dayOfWeek = date
          .toLocaleDateString("en-US", {
            weekday: "long",
          })
          .toLowerCase();
        if (
          this.DEFAULT_PREFERENCES.excludeWeekends &&
          !this.DEFAULT_PREFERENCES.workingDays.includes(dayOfWeek)
        ) {
          continue;
        }

        const schedule = await this.createScheduleForDate(doctorId, date);
        if (schedule) {
          schedules.push(schedule);
        }
      }

      console.log(
        `Generated ${schedules.length} initial schedules for doctor: ${doctorId}`
      );
    } catch (error) {
      console.error("Error generating initial schedules:", error);
      throw error;
    }
  }

  /**
   * Ensure schedules exist for the next week
   */
  static async ensureFutureSchedules(doctorId: string): Promise<void> {
    try {
      // Check if we have schedules for the next 7 days
      const today = new Date();
      const nextWeek = new Date(today);
      nextWeek.setDate(today.getDate() + 7);

      const existingSchedules = await Schedule.find({
        doctor: doctorId,
        date: { $gte: today, $lte: nextWeek },
        isActive: true,
      }).sort({ date: 1 });

      // Generate missing schedules
      const existingDates = existingSchedules.map(
        (s) => s.date.toISOString().split("T")[0]
      );

      for (let i = 1; i <= 7; i++) {
        const date = new Date(today);
        date.setDate(today.getDate() + i);
        const dateStr = date.toISOString().split("T")[0];

        if (!existingDates.includes(dateStr)) {
          const dayOfWeek = date
            .toLocaleDateString("en-US", {
              weekday: "long",
            })
            .toLowerCase();
          if (
            this.DEFAULT_PREFERENCES.excludeWeekends &&
            !this.DEFAULT_PREFERENCES.workingDays.includes(dayOfWeek)
          ) {
            continue;
          }

          await this.createScheduleForDate(doctorId, date);
        }
      }
    } catch (error) {
      console.error("Error ensuring future schedules:", error);
      throw error;
    }
  }

  /**
   * Create a schedule for a specific date
   */
  static async createScheduleForDate(
    doctorId: string,
    date: Date,
    preferences?: Partial<DoctorSchedulePreferences>
  ): Promise<any> {
    try {
      const targetDate = new Date(date);
      targetDate.setHours(0, 0, 0, 0);

      // Check if schedule already exists
      const existingSchedule = await Schedule.findOne({
        doctor: doctorId,
        date: targetDate,
        isActive: true,
      });

      if (existingSchedule) {
        return existingSchedule;
      }

      // Get doctor preferences or use defaults
      const prefs = { ...this.DEFAULT_PREFERENCES, ...preferences };

      // Generate time slots based on preferences
      const timeSlots = this.generateTimeSlots(prefs);

      const schedule = new Schedule({
        doctor: doctorId,
        date: targetDate,
        timeSlots,
        isActive: true,
        notes: "Auto-generated schedule",
      });

      const savedSchedule = await schedule.save();
      console.log(
        `Created schedule for doctor ${doctorId} on ${date.toDateString()}`
      );

      return savedSchedule;
    } catch (error) {
      console.error("Error creating schedule for date:", error);
      throw error;
    }
  }

  /**
   * Generate time slots based on preferences
   */
  private static generateTimeSlots(
    preferences: DoctorSchedulePreferences
  ): any[] {
    const timeSlots = [];
    const { start, end } = preferences.workingHours;
    const slotDuration = preferences.slotDuration;
    const maxAppointments = preferences.maxAppointmentsPerSlot;

    // Parse start and end times
    const [startHour, startMinute] = start.split(":").map(Number);
    const [endHour, endMinute] = end.split(":").map(Number);

    const startTime = startHour * 60 + startMinute; // Convert to minutes
    const endTime = endHour * 60 + endMinute;

    // Generate slots
    for (let time = startTime; time < endTime; time += slotDuration) {
      const slotStartHour = Math.floor(time / 60);
      const slotStartMinute = time % 60;
      const slotEndTime = time + slotDuration;
      const slotEndHour = Math.floor(slotEndTime / 60);
      const slotEndMinute = slotEndTime % 60;

      timeSlots.push({
        startTime: `${slotStartHour
          .toString()
          .padStart(2, "0")}:${slotStartMinute.toString().padStart(2, "0")}`,
        endTime: `${slotEndHour.toString().padStart(2, "0")}:${slotEndMinute
          .toString()
          .padStart(2, "0")}`,
        isAvailable: true,
        maxAppointments,
        currentAppointments: 0,
      });
    }

    return timeSlots;
  }

  /**
   * Clean up old schedules (older than 30 days)
   */
  static async cleanupOldSchedules(): Promise<void> {
    try {
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

      const result = await Schedule.deleteMany({
        date: { $lt: thirtyDaysAgo },
        isActive: true,
      });

      console.log(`Cleaned up ${result.deletedCount} old schedules`);
    } catch (error) {
      console.error("Error cleaning up old schedules:", error);
      throw error;
    }
  }

  /**
   * Get doctor's schedule preferences (could be extended to store in database)
   */
  static async getDoctorPreferences(
    doctorId: string
  ): Promise<DoctorSchedulePreferences> {
    // For now, return default preferences
    // In the future, this could fetch from a doctor preferences collection
    return this.DEFAULT_PREFERENCES;
  }

  /**
   * Update doctor's schedule preferences
   */
  static async updateDoctorPreferences(
    doctorId: string,
    preferences: Partial<DoctorSchedulePreferences>
  ): Promise<void> {
    // For now, just log the update
    // In the future, this could save to a doctor preferences collection
    console.log(`Updated preferences for doctor ${doctorId}:`, preferences);
  }

  /**
   * Generate schedules for a date range
   */
  static async generateSchedulesForDateRange(
    doctorId: string,
    startDate: Date,
    endDate: Date,
    preferences?: Partial<DoctorSchedulePreferences>
  ): Promise<any[]> {
    const schedules = [];
    const currentDate = new Date(startDate);

    while (currentDate <= endDate) {
      const dayOfWeek = currentDate
        .toLocaleDateString("en-US", {
          weekday: "long",
        })
        .toLowerCase();
      const prefs = { ...this.DEFAULT_PREFERENCES, ...preferences };

      if (!prefs.excludeWeekends || prefs.workingDays.includes(dayOfWeek)) {
        const schedule = await this.createScheduleForDate(
          doctorId,
          currentDate,
          prefs
        );
        if (schedule) {
          schedules.push(schedule);
        }
      }

      currentDate.setDate(currentDate.getDate() + 1);
    }

    return schedules;
  }

  /**
   * Bulk update schedules (for changing preferences)
   */
  static async bulkUpdateSchedules(
    doctorId: string,
    dateRange: { start: Date; end: Date },
    updates: {
      timeSlots?: any[];
      isActive?: boolean;
      notes?: string;
    }
  ): Promise<void> {
    try {
      const result = await Schedule.updateMany(
        {
          doctor: doctorId,
          date: { $gte: dateRange.start, $lte: dateRange.end },
        },
        updates
      );

      console.log(
        `Bulk updated ${result.modifiedCount} schedules for doctor ${doctorId}`
      );
    } catch (error) {
      console.error("Error bulk updating schedules:", error);
      throw error;
    }
  }
}
