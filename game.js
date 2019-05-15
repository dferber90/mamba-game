import React, { useEffect, useReducer, useState } from "react";
import { render, Color, Box, StdinContext } from "ink";

const ARROW_UP = "\u001B[A";
const ARROW_DOWN = "\u001B[B";
const ARROW_LEFT = "\u001B[D";
const ARROW_RIGHT = "\u001B[C";
const ENTER = "\r";
const CTRL_C = "\x03";
const BACKSPACE = "\x08";
const DELETE = "\x7F";

const BOARD_COLS = 40;
const BOARD_ROWS = 20;
const tickRate = 50;
const snakeLength = 8;

function isOnBorder(point) {
  return (
    point.x === 0 ||
    point.y === 0 ||
    point.x === BOARD_COLS - 1 ||
    point.y === BOARD_ROWS - 1
  );
}

function isWallFilled(walls, x, y) {
  return walls[y][x];
}

function fillWall(walls, x, y) {
  return walls.map((row, rowIndex) => {
    if (y !== rowIndex) return row;
    return row.map((fill, colIndex) => (x === colIndex ? true : fill));
  });
}

function getFillPercentage(walls) {
  const borders = BOARD_COLS * 2 + BOARD_ROWS * 2 - 4;
  const filled = walls.reduce((acc, rows) => {
    return (
      acc +
      rows.reduce((acc, fill) => {
        return fill ? acc + 1 : acc;
      }, 0)
    );
  }, -1 * borders);
  const total = BOARD_COLS * BOARD_ROWS - borders;
  return Math.round((filled / total) * 100);
}

const initialGameState = {
  state: "running",
  tick: 0,
  spider: {
    x: 0,
    y: 0
  },
  path: {
    draw: true,
    points: []
  },
  nextDirection: "left",
  snake: {
    direction: "left",
    points: Array.from({ length: snakeLength }).map((_, index) => ({
      x: BOARD_COLS - 1 - snakeLength + index,
      y: BOARD_ROWS - 2
    }))
  },
  walls: Array.from({ length: BOARD_ROWS }).map((_, row) =>
    Array.from({ length: BOARD_COLS }).map((_, col) =>
      isOnBorder({ x: col, y: row })
    )
  )
};

const cols = Array.from({ length: BOARD_COLS }).map((_, index) => index);
const rows = Array.from({ length: BOARD_ROWS }).map((_, index) => index);

const hasSamePosition = (a, b) => a.x === b.x && a.y === b.y;
const hasCoordinates = (dot, x, y) => dot.x === x && dot.y === y;

const Board = props => {
  return (
    rows
      .map(row =>
        cols
          .map(col => {
            // if (props.spider.x === col && props.spider.y === row) return "🕷 ";

            const isSnake = props.snake.points.some(dot =>
              hasCoordinates(dot, col, row)
            );

            if (isSnake) {
              const head = props.snake.points[0];
              const isSnakeHead = hasCoordinates(head, col, row);
              return isSnakeHead ? "oo" : "··";
            }

            if (hasCoordinates(props.spider, col, row)) return "••";
            if (isWallFilled(props.walls, col, row)) return "██";
            // if (row === 0 || row === BOARD_ROWS - 1) return "██";
            // if (col === 0 || col === BOARD_COLS - 1) return "██";
            if (props.path.points.find(dot => hasCoordinates(dot, col, row)))
              return "ϾϿ";
            return "  ";
          })
          .join("")
      )
      .join("\n") + "\n"
  );
};

const limit = (position, min, max) =>
  Math.min(Math.max(min, position), max - 1);

const randomItem = items => items[Math.floor(Math.random() * items.length)];
const last = items => items[items.length - 1];

const getSpider = (nextDirection, spider) => {
  const nextSpiderX = (() => {
    if (nextDirection === "right") return limit(spider.x + 1, 0, BOARD_COLS);
    if (nextDirection === "left") return limit(spider.x - 1, 0, BOARD_COLS);
    return spider.x;
  })();

  const nextSpiderY = (() => {
    if (nextDirection === "up") return limit(spider.y - 1, 0, BOARD_ROWS);
    if (nextDirection === "down") return limit(spider.y + 1, 0, BOARD_ROWS);
    return spider.y;
  })();

  return {
    ...spider,
    x: nextSpiderX,
    y: nextSpiderY
  };
};

const getPossibleSnakeHeadPositions = head => ({
  left: { x: limit(head.x - 1, 1, BOARD_COLS - 1), y: head.y },
  right: { x: limit(head.x + 1, 1, BOARD_COLS - 1), y: head.y },
  up: { x: head.x, y: limit(head.y + 1, 1, BOARD_ROWS - 1) },
  down: { x: head.x, y: limit(head.y - 1, 1, BOARD_ROWS - 1) }
});

const getCanGo = (snake, possibleSnakeHeadPositions, walls) => ({
  left:
    snake.direction !== "right" &&
    !snake.points.some(dot =>
      hasSamePosition(dot, possibleSnakeHeadPositions.left)
    ) &&
    !isWallFilled(
      walls,
      possibleSnakeHeadPositions.left.x,
      possibleSnakeHeadPositions.left.y
    ),
  right:
    snake.direction !== "left" &&
    !snake.points.some(dot =>
      hasSamePosition(dot, possibleSnakeHeadPositions.right)
    ) &&
    !isWallFilled(
      walls,
      possibleSnakeHeadPositions.right.x,
      possibleSnakeHeadPositions.right.y
    ),

  up:
    snake.direction !== "down" &&
    !snake.points.some(dot =>
      hasSamePosition(dot, possibleSnakeHeadPositions.up)
    ) &&
    !isWallFilled(
      walls,
      possibleSnakeHeadPositions.up.x,
      possibleSnakeHeadPositions.up.y
    ),

  down:
    snake.direction !== "up" &&
    !snake.points.some(dot =>
      hasSamePosition(dot, possibleSnakeHeadPositions.down)
    ) &&
    !isWallFilled(
      walls,
      possibleSnakeHeadPositions.down.x,
      possibleSnakeHeadPositions.down.y
    )
});

const getPossibleDirections = canGo => {
  const possibleDirections = [];
  if (canGo.left) possibleDirections.push("left");
  if (canGo.right) possibleDirections.push("right");
  if (canGo.up) possibleDirections.push("up");
  if (canGo.down) possibleDirections.push("down");
  return possibleDirections;
};

const getSnake = state => {
  const head = state.snake.points[0];
  const possibleSnakeHeadPositions = getPossibleSnakeHeadPositions(head);
  const canGo = getCanGo(state.snake, possibleSnakeHeadPositions, state.walls);
  const possibleDirections = getPossibleDirections(canGo);

  // reverse when snake is stuck
  if (possibleDirections.length === 0) {
    const reverseSnake = {
      ...state.snake,
      // this could be done a bit better by figuring out where the tail
      // can go and moving the snake in that direction, however using
      // randomItem will also eventually try all directions and make the
      // snake unstuck in case it did get stuck
      direction: randomItem(["up", "down", "left", "right"]),
      points: state.snake.points.slice().reverse()
    };
    return reverseSnake;
  }

  const nextDirection = randomItem([
    // enhance chances of keeping same direction when that direction is possible
    ...Array.from({ length: canGo[state.snake.direction] ? 2 : 0 }).map(
      () => state.snake.direction
    ),
    ...possibleDirections
  ]);

  const nextHead = possibleSnakeHeadPositions[nextDirection];

  return {
    ...state.snake,
    direction: nextDirection,
    points: [
      nextHead,
      ...state.snake.points.slice(0, state.snake.points.length - 1)
    ]
  };
};

const getPath = (path, spider, snake) => {
  const isSpiderOnBorder = isOnBorder(spider);

  const prevDot = path.points[path.points.length - 2];
  const isSpiderGoingBack =
    prevDot && hasCoordinates(prevDot, spider.x, spider.y);
  const isIntertwined = path.points.some(dot =>
    hasCoordinates(dot, spider.x, spider.y)
  );

  const snakeIntersectsPath = path.points.some(dot =>
    hasSamePosition(dot, snake.points[0])
  );

  const nextCanDraw = (() => {
    if (isSpiderOnBorder) return true;
    if (snakeIntersectsPath) return false;
    if (isSpiderGoingBack) return true;
    if (isIntertwined) return false;
    return path.draw;
  })();

  if (!nextCanDraw)
    return {
      draw: false,
      points: []
    };

  return {
    draw: true,
    points: (() => {
      if (isSpiderGoingBack) return path.points.slice(0, -1);

      const lastPoint = last(path.points);
      const nextPoint = { x: spider.x, y: spider.y };
      return lastPoint && hasSamePosition(lastPoint, nextPoint)
        ? path.points
        : [...path.points, nextPoint];
    })()
  };
};

const gameReducer = (state, action) => {
  switch (action.type) {
    case "direction":
      return { ...state, nextDirection: action.payload };
    case "restart":
      return initialGameState;
    case "tick": {
      const snake = getSnake(state, state.walls);
      const spider =
        state.tick % 2
          ? state.spider
          : getSpider(state.nextDirection, state.spider);

      // spider is eaten when it touches the snake at any point
      const isEaten = snake.points.some(point =>
        hasSamePosition(point, spider)
      );

      if (isEaten) return { ...state, state: "over", spider, snake };

      const isSpiderOnConcrete = isWallFilled(state.walls, spider.x, spider.y);

      const path = (() => {
        if (state.tick % 2) return state.path;
        if (isSpiderOnConcrete) return { ...state.path, points: [] };
        return getPath(state.path, spider, snake);
      })();

      const walls = (() => {
        let nextWalls = state.walls;
        if (isSpiderOnConcrete && state.path.points.length > 0) {
          state.path.points.forEach(point => {
            nextWalls = fillWall(nextWalls, point.x, point.y);
          });
        }
        return nextWalls;
      })();

      return {
        ...state,
        tick: state.tick + 1,
        spider,
        snake,
        path,
        walls
      };
    }
    default:
      throw new Error();
  }
};

const Game = props => {
  const [game, dispatch] = useReducer(gameReducer, initialGameState);

  useEffect(() => {
    if (!props.setRawMode || !props.stdin) return;
    props.setRawMode(true);
    props.stdin.on("data", data => {
      const key = String(data);

      switch (key) {
        case ARROW_UP:
          dispatch({ type: "direction", payload: "up" });
          break;
        case ARROW_DOWN:
          dispatch({ type: "direction", payload: "down" });
          break;
        case ARROW_LEFT:
          dispatch({ type: "direction", payload: "left" });
          break;
        case ARROW_RIGHT:
          dispatch({ type: "direction", payload: "right" });
          break;
      }

      if (key === ENTER) {
        dispatch({ type: "restart" });
        return;
      }
    });
  }, [props.stdin, props.setRawMode, dispatch]);

  useEffect(() => {
    if (game.state === "running") {
      const tick = setInterval(() => dispatch({ type: "tick" }), tickRate);
      return () => clearInterval(tick);
    }
  }, [game.state]);

  return (
    <Box justifyContent="center" alignItems="center">
      <Color rgb={[255, 255, 255]} bgKeyword="magenta">
        {game.nextDirection}
      </Color>{" "}
      <Color rgb={[255, 255, 255]} bgKeyword="magenta">
        {Math.round((game.tick * tickRate) / 1000)}s
      </Color>{" "}
      <Color rgb={[255, 255, 255]} bgKeyword="magenta">
        {game.path.points.map(p => `${p.x},${p.y}`).join(" ")}
      </Color>{" "}
      <Color rgb={[255, 255, 255]} bgKeyword="magenta">
        {getFillPercentage(game.walls)}%
      </Color>
      {"\n"}
      <Board
        spider={game.spider}
        snake={game.snake}
        path={game.path}
        walls={game.walls}
      />
    </Box>
  );
};

const GameContainer = () => {
  return (
    <StdinContext.Consumer>
      {({ stdin, setRawMode }) => (
        <Game stdin={stdin} setRawMode={setRawMode} />
      )}
    </StdinContext.Consumer>
  );
};

render(<GameContainer />);
