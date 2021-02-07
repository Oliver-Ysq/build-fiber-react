import OllyReact from "./myReact/index";

function Counter() {
  const [state, setState] = OllyReact.useState(1);
  return (
    <div>
      <h1>Count: {state}</h1>
      <button onClick={() => {
        setState(i => i + 1);
        setState(i => i + 1);
      }}>+1
      </button>
    </div>
  );
}

const element = <Counter/>;
const container = document.getElementById("root");
OllyReact.render(element, container);
