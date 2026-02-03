export const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// TODO isDebug should be a level, but will leave boolean for now
export const consoleLog = (isDebug, message) => {
  if (isDebug) {
    console.log(`${message}`);
  }
};

export const formatFriendly = (val) => {
  if (val === null || val === undefined || val === "") return 0;

  const num = Number(val);
  if (isNaN(num)) return val; // Return the original string if it's not a number

  return num.toLocaleString("en-US", {
    notation: "compact",
    compactDisplay: "short",
  });
};
