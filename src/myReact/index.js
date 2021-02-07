let nextUnitOfWork = null;
let workInProgressRoot = null;
let currentRoot = null;
let deletions = null;

requestIdleCallback(workLoop);

/*** 外部方法 ***/
export function createElement(args) {
  const {elementName, attributes, children} = args;
  return {
    type: elementName,
    props: {
      ...attributes,
      children: !children ? [] : children.map((child) =>
        typeof child === "object" ? child : createTextElement(child)
      ),
    },
  };
}

export function render(element, container) {
  workInProgressRoot = createFiber(
    "3",
    {
      children: [element],
    },
    container,
    null,
    currentRoot,
    null
  );
  deletions = [];
  nextUnitOfWork = workInProgressRoot;
}

/*** 内部方法 ***/
function workLoop(deadline) {
  let shouldYield = false;
  while (nextUnitOfWork && !shouldYield) {
    nextUnitOfWork = performUnitOfWork(nextUnitOfWork);
    shouldYield = deadline.timeRemaining() < 1;
  }
  if (!nextUnitOfWork && workInProgressRoot) {
    commitRoot();
  }
  requestIdleCallback(workLoop);
}

function performUnitOfWork(fiber) {
  const isFunctionComponent = fiber.type instanceof Function;
  if (isFunctionComponent) {
    updateFunctionComponent(fiber);
  } else {
    updateHostComponent(fiber);
  }

  if (fiber.child) return fiber.child;  //子节点存在，则返回子节点

  let nextFiber = fiber;
  while (nextFiber) {   //子节点不存在则查找兄弟节点 or 父节点的兄弟节点
    if (nextFiber.sibling) {
      return nextFiber.sibling;
    }
    nextFiber = nextFiber.parent;
  }
}

function createTextElement(text) {
  return {
    type: "TEXT_ELEMENT",
    props: {
      nodeValue: text,
      children: [],
    },
  };
}

function createFiber(type, props, dom, parent, alternate, effectTag) {
  return {
    type,
    props,
    dom,
    parent,
    alternate,
    effectTag
  };
}

function createDom(fiber) {
  const dom =
    fiber.type === "TEXT_ELEMENT"
      ? document.createTextNode("")
      : document.createElement(fiber.type);
  updateDom(dom, {}, fiber.props);
  return dom;
}

function commitRoot() {
  deletions.forEach(commitWork);
  commitWork(workInProgressRoot.child);
  currentRoot = workInProgressRoot;
  workInProgressRoot = null;
}

function commitWork(fiber) {  //遍历Fiber树，插入
  if (!fiber) return;

  let domParentFiber = fiber.parent;  //向上遍历，直到找到带有fiber.dom的父Fiber
  while (!domParentFiber.dom) {
    domParentFiber = domParentFiber.parent;
  }
  const domParent = domParentFiber.dom;

  if (fiber.effectTag === "PLACEMENT" && fiber.dom != null) {
    domParent.appendChild(fiber.dom);
  } else if (fiber.effectTag === "UPDATE" && fiber.dom != null) {
    updateDom(fiber.dom, fiber.alternate.props, fiber.props);
  } else if (fiber.effectTag === "DELETION") {
    commitDeletion(fiber, domParent);
  }

  commitWork(fiber.child);
  commitWork(fiber.sibling);
}

function commitDeletion(fiber, domParent) { //在删除节点时，我们还需要继续操作，直到找到带有DOM节点的子节点为止。
  if (fiber.dom) {
    domParent.removeChild(fiber.dom);
  } else {
    commitDeletion(fiber.child, domParent);
  }
}

function reconcileChildren(wipFiber, elements) {
  let index = 0;
  let oldFiber = wipFiber.alternate && wipFiber.alternate.child;
  let prevSibling = null;

  while (index < elements.length || oldFiber != null) {
    const element = elements[index];
    let newFiber = null;

    const sameType = oldFiber && element && element.type === oldFiber.type;

    if (sameType) { //UPDATE
      newFiber = createFiber(
        oldFiber.type,
        element.props,
        oldFiber.dom,
        wipFiber,
        oldFiber,
        "UPDATE",
      );
    }
    if (element && !sameType) { //ADD
      newFiber = createFiber(
        element.type,
        element.props,
        null,
        wipFiber,
        null,
        "PLACEMENT",
      );
    }
    if (oldFiber && !sameType) {  //DELETE
      oldFiber.effectTag = "DELETION";
      deletions.push(oldFiber);
    }
    if (oldFiber) {
      oldFiber = oldFiber.sibling;
    }

    if (index === 0) {  //第一个子fiber为children
      wipFiber.child = newFiber;
    } else {  //其他子fiber依次用sibling作连接
      prevSibling.sibling = newFiber;
    }

    prevSibling = newFiber;
    index++;
  }
}

function updateFunctionComponent(fiber) {
  wipFiber = fiber;
  hookIndex = 0;
  wipFiber.hooks = [];
  const children = [fiber.type(fiber.props)];
  reconcileChildren(fiber, children);
}

function updateHostComponent(fiber) {
  if (!fiber.dom) {
    fiber.dom = createDom(fiber);
  }
  reconcileChildren(fiber, fiber.props.children);
}

//更新dom
const isEvent = key => key.startsWith("on");
const isProperty = key =>
  key !== "children" && !isEvent(key);
const isNew = (prev, next) => key =>
  prev[key] !== next[key];
const isGone = (prev, next) => key => !(key in next);

function updateDom(dom, prevProps, nextProps) {
  // Remove old properties
  Object.keys(prevProps)
        .filter(isProperty)
        .filter(isGone(prevProps, nextProps))
        .forEach(name => {
          dom[name] = "";
        });
  // Set new or changed properties
  Object.keys(nextProps)
        .filter(isProperty)
        .filter(isNew(prevProps, nextProps))
        .forEach(name => {
          dom[name] = nextProps[name];
        });

//Remove old or changed event listeners
  Object.keys(prevProps)
        .filter(isEvent)
        .filter(
          key =>
            !(key in nextProps) ||
            isNew(prevProps, nextProps)(key)
        )
        .forEach(name => {
          const eventType = name
            .toLowerCase()
            .substring(2);
          dom.removeEventListener(
            eventType,
            prevProps[name]
          );
        });

  // Add event listeners
  Object.keys(nextProps)
        .filter(isEvent)
        .filter(isNew(prevProps, nextProps))
        .forEach(name => {
          const eventType = name
            .toLowerCase()
            .substring(2);
          dom.addEventListener(
            eventType,
            nextProps[name]
          );
        });

}

/*** HOOKS ***/
let wipFiber = null; //rootFiber
let hookIndex = 0;  //hooks下标
function useState(initial) {
  console.log(wipFiber.alternate && wipFiber.alternate.hooks);
  const oldHook = //检查是否有旧的hooks
    wipFiber.alternate &&
    wipFiber.alternate.hooks &&
    wipFiber.alternate.hooks[hookIndex];
  const hook = {  //如果有旧的hooks则直接引用；否则使用初始值
    state: oldHook ? oldHook.state : initial,
    queue: []
  };

  const actions = oldHook ? oldHook.queue : []; //获取每个动作
  actions.forEach(action => { //对于每个动作，hook都要执行
    hook.state = action(hook.state);
  });

  const setState = (action) => {
    hook.queue.push(action);
    workInProgressRoot = createFiber(// 切换fiber tree
      "3",
      currentRoot.props,
      currentRoot.dom,
      null,
      currentRoot,
      null
    );
    nextUnitOfWork = workInProgressRoot; //设定nextUnitOfWork，触发更新。
    deletions = [];
  };
  wipFiber.hooks.push(hook);  //将当前hooks push到rootFiber的hooks数组中
  hookIndex++;  //下标+1
  return [hook.state, setState];
}

export default {
  createElement,
  render,
  useState
};