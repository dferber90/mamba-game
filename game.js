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

const initialGameState = {
  state: "running",
  tick: 0,
  spider: {
    x: 0,
    y: 0,
    direction: "left",
    canDraw: true,
    path: [{ x: 0, y: 0 }]
  },
  nextDirection: "left",
  snake: {
    direction: "left",
    points: Array.from({ length: snakeLength }).map((_, index) => ({
      x: BOARD_COLS - 1 - snakeLength + index,
      y: BOARD_ROWS - 2
    }))
  }
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
            if (row === 0 || row === BOARD_ROWS - 1) return "██";
            if (col === 0 || col === BOARD_COLS - 1) return "██";
            if (props.spider.path.find(dot => hasCoordinates(dot, col, row)))
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

const getSpider = (nextDirection, spider, snake) => {
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

  const prevDot = spider.path[spider.path.length - 2];
  const isSpiderGoingBack =
    prevDot && hasCoordinates(prevDot, nextSpiderX, nextSpiderY);
  const isIntertwined =
    !isSpiderGoingBack &&
    spider.path.some(dot => hasCoordinates(dot, nextSpiderX, nextSpiderY));

  const isOnBorder =
    nextSpiderX === 0 ||
    nextSpiderY === 0 ||
    nextSpiderX === BOARD_COLS - 1 ||
    nextSpiderY === BOARD_ROWS - 1;

  const snakeIntersectsPath = spider.path.some(dot =>
    hasSamePosition(dot, snake.points[0])
  );

  const nextCanDraw = (() => {
    if (isOnBorder) return true;
    if (snakeIntersectsPath) return false;
    if (isSpiderGoingBack) return true;
    if (isIntertwined) return false;
    return spider.canDraw;
  })();

  return {
    ...spider,
    x: nextSpiderX,
    y: nextSpiderY,
    canDraw: nextCanDraw,
    path: (() => {
      if (!nextCanDraw) return [];
      if (isSpiderGoingBack) return spider.path.slice(0, -1);

      return [...spider.path, { x: nextSpiderX, y: nextSpiderY }];
    })()
  };
};

const getPossibleSnakeHeadPositions = head => ({
  left: { x: limit(head.x - 1, 1, BOARD_COLS - 1), y: head.y },
  right: { x: limit(head.x + 1, 1, BOARD_COLS - 1), y: head.y },
  up: { x: head.x, y: limit(head.y + 1, 1, BOARD_ROWS - 1) },
  down: { x: head.x, y: limit(head.y - 1, 1, BOARD_ROWS - 1) }
});

const getCanGo = (snake, possibleSnakeHeadPositions) => ({
  left:
    snake.direction !== "right" &&
    !snake.points.some(dot =>
      hasSamePosition(dot, possibleSnakeHeadPositions.left)
    ),
  right:
    snake.direction !== "left" &&
    !snake.points.some(dot =>
      hasSamePosition(dot, possibleSnakeHeadPositions.right)
    ),
  up:
    snake.direction !== "down" &&
    !snake.points.some(dot =>
      hasSamePosition(dot, possibleSnakeHeadPositions.up)
    ),
  down:
    snake.direction !== "up" &&
    !snake.points.some(dot =>
      hasSamePosition(dot, possibleSnakeHeadPositions.down)
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
  const canGo = getCanGo(state.snake, possibleSnakeHeadPositions);
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

const gameReducer = (state, action) => {
  switch (action.type) {
    case "direction":
      return { ...state, nextDirection: action.payload };
    case "restart":
      return initialGameState;
    case "tick": {
      const snake = getSnake(state);
      const spider =
        state.tick % 2
          ? state.spider
          : getSpider(state.nextDirection, state.spider, snake);

      const isEaten = snake.points.some(point =>
        hasSamePosition(point, spider)
      );

      if (isEaten) {
        return {
          ...state,
          state: "over",
          spider,
          snake
        };
      }

      return {
        ...state,
        tick: state.tick + 1,
        spider,
        snake
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
        {game.snake.points.length}
      </Color>
      {"\n"}
      <Board spider={game.spider} snake={game.snake} />
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
