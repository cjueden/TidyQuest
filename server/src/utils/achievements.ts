export interface AchievementDef {
  id: string;
  titleKey: string;
  descKey: string;
  icon: 'spark' | 'fire' | 'coin' | 'star' | 'crown' | 'broom' | 'heart' | 'shield' | 'rocket' | 'diamond';
  threshold: number;
  metric: BuiltinMetric;
  /** Hidden (title and rule) until earned */
  secret?: boolean;
}

export type BuiltinMetric = 'completions' | 'streak' | 'coins' | 'rooms_clean' | 'weekly_tasks' | 'weekend_tasks' | 'perfect_weeks'
  | 'rewards_redeemed' | 'pot_contributions' | 'boost_completions' | 'goal_weeks' | 'room_sweeps' | 'early_chores' | 'birthday_chores'
  | 'cheers_given' | 'cheers_received' | 'team_ups';

export const ACHIEVEMENTS: AchievementDef[] = [
  // Getting started
  { id: 'first_task', titleKey: 'achievements.firstStep', descKey: 'achievements.firstStepDesc', icon: 'spark', threshold: 1, metric: 'completions' },
  { id: 'helper_10', titleKey: 'achievements.helper', descKey: 'achievements.helperDesc', icon: 'star', threshold: 10, metric: 'completions' },
  { id: 'busy_bee_25', titleKey: 'achievements.busyBee', descKey: 'achievements.busyBeeDesc', icon: 'broom', threshold: 25, metric: 'completions' },
  { id: 'cleaning_hero_50', titleKey: 'achievements.cleaningHero', descKey: 'achievements.cleaningHeroDesc', icon: 'shield', threshold: 50, metric: 'completions' },
  { id: 'chore_champion_100', titleKey: 'achievements.choreChampion', descKey: 'achievements.choreChampionDesc', icon: 'crown', threshold: 100, metric: 'completions' },
  { id: 'tidyquest_legend_250', titleKey: 'achievements.legend', descKey: 'achievements.legendDesc', icon: 'diamond', threshold: 250, metric: 'completions' },
  { id: 'unstoppable_500', titleKey: 'achievements.unstoppable', descKey: 'achievements.unstoppableDesc', icon: 'rocket', threshold: 500, metric: 'completions' },

  // Streaks
  { id: 'streak_3', titleKey: 'achievements.onFire', descKey: 'achievements.onFireDesc', icon: 'fire', threshold: 3, metric: 'streak' },
  { id: 'streak_7', titleKey: 'achievements.streakMaster', descKey: 'achievements.streakMasterDesc', icon: 'fire', threshold: 7, metric: 'streak' },
  { id: 'streak_14', titleKey: 'achievements.twoWeekWarrior', descKey: 'achievements.twoWeekWarriorDesc', icon: 'fire', threshold: 14, metric: 'streak' },
  { id: 'streak_30', titleKey: 'achievements.monthlyMachine', descKey: 'achievements.monthlyMachineDesc', icon: 'crown', threshold: 30, metric: 'streak' },
  { id: 'streak_100', titleKey: 'achievements.centurion', descKey: 'achievements.centurionDesc', icon: 'diamond', threshold: 100, metric: 'streak' },
  { id: 'streak_60_night_owl', titleKey: 'achievements.nightOwl', descKey: 'achievements.nightOwlDesc', icon: 'rocket', threshold: 60, metric: 'streak' },

  // Coins
  { id: 'coins_50', titleKey: 'achievements.piggyBank', descKey: 'achievements.piggyBankDesc', icon: 'coin', threshold: 50, metric: 'coins' },
  { id: 'coins_100', titleKey: 'achievements.saver', descKey: 'achievements.saverDesc', icon: 'coin', threshold: 100, metric: 'coins' },
  { id: 'coins_500', titleKey: 'achievements.treasureHunter', descKey: 'achievements.treasureHunterDesc', icon: 'coin', threshold: 500, metric: 'coins' },
  { id: 'coins_1000', titleKey: 'achievements.goldMaster', descKey: 'achievements.goldMasterDesc', icon: 'crown', threshold: 1000, metric: 'coins' },
  { id: 'coins_5000', titleKey: 'achievements.millionaire', descKey: 'achievements.millionaireDesc', icon: 'diamond', threshold: 5000, metric: 'coins' },

  // Room mastery
  { id: 'room_master_3', titleKey: 'achievements.roomTamer', descKey: 'achievements.roomTamerDesc', icon: 'heart', threshold: 3, metric: 'rooms_clean' },
  { id: 'room_master_5', titleKey: 'achievements.housePride', descKey: 'achievements.housePrideDesc', icon: 'shield', threshold: 5, metric: 'rooms_clean' },

  // Weekly productivity
  { id: 'weekly_5', titleKey: 'achievements.weekendWarrior', descKey: 'achievements.weekendWarriorDesc', icon: 'star', threshold: 5, metric: 'weekend_tasks' },
  { id: 'weekly_15', titleKey: 'achievements.superWeek', descKey: 'achievements.superWeekDesc', icon: 'rocket', threshold: 15, metric: 'weekly_tasks' },

  // Perfect weeks (all due tasks done)
  { id: 'perfect_1', titleKey: 'achievements.perfectWeek', descKey: 'achievements.perfectWeekDesc', icon: 'star', threshold: 1, metric: 'perfect_weeks' },
  { id: 'perfect_4', titleKey: 'achievements.perfectMonth', descKey: 'achievements.perfectMonthDesc', icon: 'crown', threshold: 4, metric: 'perfect_weeks' },

  // Spending and teamwork
  { id: 'first_reward', titleKey: 'achievements.firstPurchase', descKey: 'achievements.firstPurchaseDesc', icon: 'coin', threshold: 1, metric: 'rewards_redeemed' },
  { id: 'team_player', titleKey: 'achievements.teamPlayer', descKey: 'achievements.teamPlayerDesc', icon: 'heart', threshold: 1, metric: 'pot_contributions' },
  { id: 'team_spirit', titleKey: 'achievements.teamSpirit', descKey: 'achievements.teamSpiritDesc', icon: 'heart', threshold: 25, metric: 'cheers_given' },
  { id: 'fan_favorite', titleKey: 'achievements.fanFavorite', descKey: 'achievements.fanFavoriteDesc', icon: 'star', threshold: 25, metric: 'cheers_received' },
  { id: 'teamwork_5', titleKey: 'achievements.betterTogether', descKey: 'achievements.betterTogetherDesc', icon: 'heart', threshold: 5, metric: 'team_ups' },
  { id: 'teamwork_25', titleKey: 'achievements.dreamTeam', descKey: 'achievements.dreamTeamDesc', icon: 'star', threshold: 25, metric: 'team_ups' },
  { id: 'teamwork_100', titleKey: 'achievements.unstoppableCrew', descKey: 'achievements.unstoppableCrewDesc', icon: 'crown', threshold: 100, metric: 'team_ups' },
  { id: 'double_trouble', titleKey: 'achievements.doubleTrouble', descKey: 'achievements.doubleTroubleDesc', icon: 'rocket', threshold: 1, metric: 'boost_completions' },

  // Weekly goals hit in a row
  { id: 'goal_streak_4', titleKey: 'achievements.goalGetter', descKey: 'achievements.goalGetterDesc', icon: 'star', threshold: 4, metric: 'goal_weeks' },
  { id: 'goal_streak_12', titleKey: 'achievements.goalMachine', descKey: 'achievements.goalMachineDesc', icon: 'crown', threshold: 12, metric: 'goal_weeks' },

  // Secret
  { id: 'clean_sweep', titleKey: 'achievements.cleanSweep', descKey: 'achievements.cleanSweepDesc', icon: 'broom', threshold: 1, metric: 'room_sweeps', secret: true },
  { id: 'early_bird_5', titleKey: 'achievements.earlyBird', descKey: 'achievements.earlyBirdDesc', icon: 'spark', threshold: 5, metric: 'early_chores', secret: true },
  { id: 'birthday_helper', titleKey: 'achievements.birthdayHelper', descKey: 'achievements.birthdayHelperDesc', icon: 'heart', threshold: 1, metric: 'birthday_chores', secret: true },
];

export type AchievementStats = Record<BuiltinMetric, number>;

export function buildAchievements(stats: AchievementStats) {
  return ACHIEVEMENTS.map((a) => {
    const value = stats[a.metric] ?? 0;
    const progress = Math.min(100, Math.round((value / a.threshold) * 100));
    return {
      id: a.id,
      titleKey: a.titleKey,
      descKey: a.descKey,
      icon: a.icon,
      threshold: a.threshold,
      metric: a.metric,
      secret: !!a.secret,
      value,
      progress,
      unlocked: value >= a.threshold,
    };
  });
}
