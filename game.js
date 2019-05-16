#!/usr/bin/env node

import "array-flat-polyfill";
import React, { useEffect, useReducer } from "react";
import { render, Color, Box, StdinContext, Text } from "ink";

const ARROW_UP = "\u001B[A";
const ARROW_DOWN = "\u001B[B";
const ARROW_LEFT = "\u001B[D";
const ARROW_RIGHT = "\u001B[C";
const ENTER = "\r";

const BOARD_COLS = 40;
const BOARD_ROWS = 20;
const tickDuration = 64;
const blockDurationInSeconds = 30;

const blockTicks = (blockDurationInSeconds * 1000) / tickDuration;

const levels = [
  { snakeLength: 6, requiredFillPercentage: 50 },
  { snakeLength: 8, requiredFillPercentage: 75 },
  { snakeLength: 10, requiredFillPercentage: 85 },
  { snakeLength: 10, requiredFillPercentage: 90 },
  { snakeLength: 10, requiredFillPercentage: 95 }
];

function isBorder(point) {
  return (
    point.x === 0 ||
    point.y === 0 ||
    point.x === BOARD_COLS - 1 ||
    point.y === BOARD_ROWS - 1
  );
}

function isWall(walls, x, y) {
  return walls[y][x];
}

function fillWall(walls, x, y) {
  return walls.map((row, rowIndex) => {
    if (y !== rowIndex) return row;
    return row.map((fill, colIndex) => (x === colIndex ? true : fill));
  });
}

function getSnakeArea(visited, walls, x, y) {
  return [{ x: x - 1, y }, { x: x + 1, y }, { x, y: y + 1 }, { x, y: y - 1 }]
    .filter(({ x, y }) => {
      if (x < 0 || x > BOARD_COLS) return false;
      if (y < 0 || y > BOARD_ROWS) return false;
      if (isWall(walls, x, y)) return false;
      if (visited[y][x]) return false;
      return true;
    })
    .flatMap(({ x, y }) => {
      visited[y][x] = true;
      return [{ x, y }, ...getSnakeArea(visited, walls, x, y)];
    });
}

function fillNonSnakeArea(walls, snakeArea) {
  return walls.map((row, rowIndex) => {
    return row.map((fill, colIndex) =>
      snakeArea.some(dot => hasCoordinates(dot, colIndex, rowIndex))
        ? fill
        : true
    );
  });
}

function fillHoles(walls, snakeHead) {
  const visited = walls.map(row => row.map(() => false));
  const snakeArea = getSnakeArea(visited, walls, snakeHead.x, snakeHead.y);
  return fillNonSnakeArea(walls, snakeArea);
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

function consumePressedDirection(pressedDirections) {
  const direction = pressedDirections[0];
  return {
    pressedDirections:
      pressedDirections.length > 1
        ? pressedDirections.slice(1)
        : pressedDirections,
    direction
  };
}

const rows = Array.from({ length: BOARD_ROWS }).map((_, index) => index);
const cols = Array.from({ length: BOARD_COLS }).map((_, index) => index);

const createInitialGameState = ({ level }) => {
  const levelData = levels[level] || last(levels);
  return {
    level,
    state: "running",
    tick: 0,
    spider: { x: 0, y: 0 },
    path: { draw: true, points: [] },
    pressedDirections: ["left"],
    snake: {
      direction: "left",
      points: Array.from({ length: levelData.snakeLength }).map((_, index) => ({
        x: BOARD_COLS - 1 - levelData.snakeLength + index,
        y: BOARD_ROWS - 2
      }))
    },
    walls: rows.map((_, row) =>
      cols.map((_, col) => isBorder({ x: col, y: row }))
    ),
    tickOfLastBlock: 0,
    fillPercentage: 0,
    requiredFillPercentage: levelData.requiredFillPercentage
  };
};

const hasSamePosition = (a, b) => a.x === b.x && a.y === b.y;
const hasCoordinates = (dot, x, y) => dot.x === x && dot.y === y;

const Board = props => {
  return rows.map(row => (
    <Box key={row}>
      {cols.map(col => {
        const isSnake = props.snake.points.some(dot =>
          hasCoordinates(dot, col, row)
        );

        if (isSnake) {
          const head = props.snake.points[0];
          const isSnakeHead = hasCoordinates(head, col, row);
          return isSnakeHead ? "oo" : "··";
        }

        if (hasCoordinates(props.spider, col, row)) return "••";
        if (isWall(props.walls, col, row)) return "██";
        if (props.path.points.find(dot => hasCoordinates(dot, col, row)))
          return "ϾϿ";
        return "  ";
      })}
    </Box>
  ));
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
    !isWall(
      walls,
      possibleSnakeHeadPositions.left.x,
      possibleSnakeHeadPositions.left.y
    ),
  right:
    snake.direction !== "left" &&
    !snake.points.some(dot =>
      hasSamePosition(dot, possibleSnakeHeadPositions.right)
    ) &&
    !isWall(
      walls,
      possibleSnakeHeadPositions.right.x,
      possibleSnakeHeadPositions.right.y
    ),

  up:
    snake.direction !== "down" &&
    !snake.points.some(dot =>
      hasSamePosition(dot, possibleSnakeHeadPositions.up)
    ) &&
    !isWall(
      walls,
      possibleSnakeHeadPositions.up.x,
      possibleSnakeHeadPositions.up.y
    ),

  down:
    snake.direction !== "up" &&
    !snake.points.some(dot =>
      hasSamePosition(dot, possibleSnakeHeadPositions.down)
    ) &&
    !isWall(
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
      return {
        ...state,
        pressedDirections: [...state.pressedDirections, action.payload]
      };
    case "restart":
      return createInitialGameState({ level: 0 });
    case "next-level": {
      const level = state.level + 1;
      return createInitialGameState({ level });
    }
    case "tick": {
      const snake = getSnake(state, state.walls);
      const { pressedDirections, direction } =
        state.tick % 2
          ? consumePressedDirection(state.pressedDirections)
          : {
              pressedDirections: state.pressedDirections,
              direction: state.pressedDirections[0]
            };
      const spider =
        state.tick % 2 ? state.spider : getSpider(direction, state.spider);

      // spider is eaten when it touches the snake at any point
      const isEaten = snake.points.some(point =>
        hasSamePosition(point, spider)
      );

      if (isEaten)
        return {
          ...state,
          state: "over-eaten",
          spider,
          snake,
          pressedDirections
        };

      // ticks expired
      if (state.tick - state.tickOfLastBlock > blockTicks)
        return {
          ...state,
          state: "over-timeout",
          spider,
          snake,
          pressedDirections
        };

      const isSpiderOnConcrete = isWall(state.walls, spider.x, spider.y);

      const path = (() => {
        if (state.tick % 2) return state.path;
        if (isSpiderOnConcrete)
          return { ...state.path, draw: true, points: [] };
        return getPath(state.path, spider, snake);
      })();

      const hasFinishedBlock =
        isSpiderOnConcrete && state.path.points.length > 0;

      const walls = hasFinishedBlock
        ? (() => {
            let nextWalls = state.walls;

            state.path.points.forEach(point => {
              nextWalls = fillWall(nextWalls, point.x, point.y);
            });
            nextWalls = fillHoles(nextWalls, snake.points[0]);

            return nextWalls;
          })()
        : state.walls;

      const fillPercentage = hasFinishedBlock
        ? getFillPercentage(walls)
        : state.fillPercentage;

      const nextState = {
        ...state,
        tick: state.tick + 1,
        pressedDirections,
        spider,
        snake,
        path,
        walls,
        tickOfLastBlock: hasFinishedBlock
          ? state.tick + 1
          : state.tickOfLastBlock,
        fillPercentage
      };

      if (fillPercentage >= state.requiredFillPercentage)
        return { ...nextState, state: "level-completed" };

      return nextState;
    }
    default:
      throw new Error();
  }
};

const Game = props => {
  const [game, dispatch] = useReducer(
    gameReducer,
    createInitialGameState({ level: 0 })
  );

  useEffect(() => {
    if (!props.setRawMode || !props.stdin) return;
    props.setRawMode(true);
    const listener = data => {
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

      if (
        (game.state === "over-eaten" || game.state === "over-timeout") &&
        key === ENTER
      ) {
        dispatch({ type: "restart" });
        return;
      }
      if (game.state === "level-completed" && key === ENTER) {
        dispatch({ type: "next-level" });
        return;
      }
    };

    props.stdin.on("data", listener);
    return () => {
      props.stdin.removeListener("data", listener);
    };
  }, [props.stdin, props.setRawMode, dispatch, game.state]);

  useEffect(() => {
    if (game.state === "running") {
      const tick = setInterval(() => dispatch({ type: "tick" }), tickDuration);
      return () => clearInterval(tick);
    }
  }, [game.state]);

  const description = (() => {
    const readableLevel = game.level + 1;
    if (game.state === "level-completed")
      return (
        <Color rgb={[255, 255, 255]} bgKeyword="green">
          Level {readableLevel} completed with {game.fillPercentage}% filled.
          Press [ENTER] to start level {readableLevel + 1}.
        </Color>
      );

    if (game.state === "over-eaten")
      return (
        <Color rgb={[255, 255, 255]} bgKeyword="darkred">
          You got eaten in level {readableLevel}. Press [ENTER] to restart.
        </Color>
      );

    if (game.state === "over-timeout")
      return (
        <Color rgb={[255, 255, 255]} bgKeyword="darkred">
          You did not build a block in time in level {readableLevel}. Press
          [ENTER] to restart.
        </Color>
      );

    return (
      <React.Fragment>
        Level {readableLevel}
        {" | "}
        {Math.ceil(
          ((blockTicks - (game.tick - game.tickOfLastBlock)) * tickDuration) /
            1000
        )}
        {"s remaining | "}
        {game.fillPercentage} of {game.requiredFillPercentage}% filled
      </React.Fragment>
    );
  })();

  return (
    <Box flexDirection="column">
      <Box>{description}</Box>
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
