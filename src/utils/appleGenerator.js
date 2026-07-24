/**
 * Generate a game board based on player count.
 * 1 player: 17x10 (170 apples)
 * 2 players: 17x15 (255 apples)
 * 3-4 players: 20x17 (340 apples)
 */

export const BOARD_SIZES = {
  1: { cols: 17, rows: 10 },
  2: { cols: 17, rows: 15 },
  3: { cols: 20, rows: 17 },
  4: { cols: 20, rows: 17 }
};

/**
 * Generate apples with random distribution of numbers 1-9.
 * This is modularized so that we can change the logic to generate
 * an exactly equal count of each number later if needed.
 * @param {number} totalCount Total number of apples
 * @returns {Array} Array of apple objects { id, number, removed }
 */
export function generateBoard(playerCount = 1) {
  const size = BOARD_SIZES[playerCount] || BOARD_SIZES[1];
  const totalCount = size.cols * size.rows;
  
  const board = [];
  
  for (let i = 0; i < totalCount; i++) {
    // Generate number 1-9
    // Following standard random distribution for now
    const num = Math.floor(Math.random() * 9) + 1;
    board.push({
      id: i,
      number: num,
      removed: false
    });
  }
  
  return {
    board,
    size
  };
}
