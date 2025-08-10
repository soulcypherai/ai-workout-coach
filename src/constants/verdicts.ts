export const allVerdicts: Record<
  number,
  { description: string; options: string[]; result: number | null }[]
> = {
  1: [
    {
      description: "Which judge will be the toughest in episode 1?",
      options: [
        "AI Jesse Pollak",
        "AI Hang Yin",
        "AI Mark Rydon",
        "AI Daryl Xu",
      ],
      result: 2,
    },
    {
      description: "How many judges will say YES to Survivor.Fun?",
      options: ["0", "1", "2", "3", "4"],
      result: 2,
    },
    {
      description:
        "Which judge will get tipped the most on World.fun + be invited back to the next Episode?",
      options: [
        "AI Jesse Pollak",
        "AI Hang Yin",
        "AI Mark Rydon",
        "AI Daryl Xu",
      ],
      result: 0,
    },
    {
      description: "How many judges will say YES to Wanderers.ai?",
      options: ["0", "1", "2", "3", "4"],
      result: 3,
    },
    {
      description: "How many judges will say YES to Infinityg.ai?",
      options: ["0", "1", "2", "3", "4"],
      result: 4,
    },
  ],
  2: [
    {
      description: "Who’s your favorite AI judge in episode 2?",
      options: ["AI Jesse Pollak", "AI Luca Curran", "AI Bill", "AI Charles"],
      result: null,
    },
    {
      description: "What’s your favorite project in episode 2?",
      options: ["Tako Protocol", "Gloria AI", "FreedomGPT"],
      result: null,
    },
    {
      description: "How many judges will say YES to Tako Protocol?",
      options: ["0", "1", "2", "3", "4"],
      result: 0,
    },
    {
      description: "How many judges will say YES to Gloria AI?",
      options: ["0", "1", "2", "3", "4"],
      result: 2,
    },
    {
      description: "How many judges will say YES to FreedomGPT?",
      options: ["0", "1", "2", "3", "4"],
      result: 3,
    },
    {
      description: "Which judge will be the toughest in episode 2?",
      options: ["AI Jesse Pollak", "AI Luca Curran", "AI Bill", "AI Charles"],
      result: 2,
    },
  ],
  3: [
    {
      description: "Who’s your favorite AI judge in episode 3?",
      options: [
        "AI Jonathan King",
        "AI Sanat Kapur",
        "AI Sterling Campbell",
        "AI Tina Dai",
      ],
      result: 1,
    },
    {
      description: "What’s your favorite project in episode 3?",
      options: ["Trade Clash", "Virtuals", "CHOMP"],
      result: 2,
    },
    {
      description: "Which judge will be the toughest in episode 3?",
      options: [
        "AI Jonathan King",
        "AI Sanat Kapur",
        "AI Sterling Campbell",
        "AI Tina Dai",
      ],
      result: 0,
    },
    {
      description: "How many judges will say YES to Trade Clash?",
      options: ["0", "1", "2", "3", "4"],
      result: 2,
    },
    {
      description: "How many judges will say YES to Virtuals?",
      options: ["0", "1", "2", "3", "4"],
      result: 3,
    },
    {
      description: "How many judges will say YES to CHOMP?",
      options: ["0", "1", "2", "3", "4"],
      result: 3,
    },
  ],
};
