/**
 * @module Inferno
 */
/** TypeDoc Comment */

import {
  combineFrom,
  isArray,
  isFunction,
  isInvalid,
  isNull,
  isNullOrUndef,
  isString,
  isStringOrNumber,
  isUndefined,
  NO_OP,
  throwError
} from "inferno-shared";
import { VNodeFlags } from "inferno-vnode-flags";
import { directClone, isVNode, options, VNode } from "../core/implementation";
import {
  mount,
  mountArrayChildren,
  mountRef,
} from "./mounting";
import { unmount } from "./unmounting";
import {
  appendChild,
  EMPTY_OBJ,
  insertOrAppend,
  isKeyed,
  removeChild,
  replaceChild,
  setTextContent,
  updateTextContent
} from "./utils/common";
import {
  isControlledFormElement,
  processElement
} from "./wrappers/processElement";
import { patchProp, removeProp } from "./props";
import { handleComponentInput } from "./utils/componentutil";
import {validateKeys} from "../core/validate";

function removeAllChildren(dom: Element, children) {
  for (let i = 0, len = children.length; i < len; i++) {
    const child = children[i];

    if (!isInvalid(child)) {
      unmount(child, null);
    }
  }
  dom.textContent = "";
}

function replaceWithNewNode(
  lastNode,
  nextNode,
  parentDom,
  lifecycle: Function[],
  context: Object,
  isSVG: boolean
) {
  unmount(lastNode, null);
  replaceChild(
    parentDom,
    mount(nextNode, null, lifecycle, context, isSVG),
    lastNode.dom
  );
}

export function patch(
  lastVNode: VNode,
  nextVNode: VNode,
  parentDom: Element,
  lifecycle: Function[],
  context: Object,
  isSVG: boolean
) {
  if (lastVNode !== nextVNode) {
    const nextFlags = nextVNode.flags;

    if (lastVNode.flags !== nextFlags || nextFlags & VNodeFlags.ReCreate) {
      unmount(lastVNode, null);

      const dom = mount(nextVNode, null, lifecycle, context, isSVG);

      if (isNull(dom)) {
        removeChild(parentDom, lastVNode.dom as Element);
      } else {
        replaceChild(parentDom, dom, lastVNode.dom);
      }
    } else if (nextFlags & VNodeFlags.Element) {
      patchElement(lastVNode, nextVNode, parentDom, lifecycle, context, isSVG);
    } else if (nextFlags & VNodeFlags.Component) {
      patchComponent(lastVNode, nextVNode, parentDom, lifecycle, context, isSVG,(nextFlags & VNodeFlags.ComponentClass) > 0);
    } else if (nextFlags & VNodeFlags.Text) {
      patchText(lastVNode, nextVNode, parentDom);
    } else if (nextFlags & VNodeFlags.Void) {
      nextVNode.dom = lastVNode.dom
    } else if (nextFlags & VNodeFlags.Portal) {
      patchPortal(lastVNode, nextVNode, lifecycle, context);
    }
  }
}

function patchPortal(lastVNode: VNode, nextVNode: VNode, lifecycle, context) {
  const lastContainer = lastVNode.type as Element;
  const nextContainer = nextVNode.type as Element;
  const nextChildren = nextVNode.children as VNode;

  patchChildren(
    0,
    0,
    lastVNode.children as VNode,
    nextChildren,
    lastContainer as Element,
    lifecycle,
    context,
    false
  );

  nextVNode.dom = lastVNode.dom;

  if (lastContainer !== nextContainer && !isInvalid(nextChildren)) {
    const node = nextChildren.dom as Element;

    lastContainer.removeChild(node);
    nextContainer.appendChild(node);
  }
}

function unmountChildren(children, dom: Element) {
  if (isVNode(children)) {
    unmount(children, dom);
  } else if (isArray(children)) {
    removeAllChildren(dom, children);
  } else {
    dom.textContent = "";
  }
}

export function patchElement(
  lastVNode: VNode,
  nextVNode: VNode,
  parentDom: Element | null,
  lifecycle: Function[],
  context: Object,
  isSVG: boolean
) {
  const nextTag = nextVNode.type;

  if (lastVNode.type !== nextTag) {
    replaceWithNewNode(
      lastVNode,
      nextVNode,
      parentDom,
      lifecycle,
      context,
      isSVG
    );
  } else {
    const dom = lastVNode.dom as Element;
    const lastProps = lastVNode.props;
    const nextProps = nextVNode.props;
    const lastChildren = lastVNode.children;
    const nextChildren = nextVNode.children;
    const lastFlags = lastVNode.flags;
    const nextFlags = nextVNode.flags;
    const nextRef = nextVNode.ref;
    const lastClassName = lastVNode.className;
    const nextClassName = nextVNode.className;

    nextVNode.dom = dom;
    isSVG = isSVG || (nextFlags & VNodeFlags.SvgElement) > 0;
    if (lastChildren !== nextChildren) {
      patchChildren(
        lastFlags,
        nextFlags,
        lastChildren,
        nextChildren,
        dom,
        lifecycle,
        context,
        isSVG && nextTag !== "foreignObject"
      );
    }

    // inlined patchProps  -- starts --
    if (lastProps !== nextProps) {
      const lastPropsOrEmpty = lastProps || EMPTY_OBJ;
      const nextPropsOrEmpty = nextProps || (EMPTY_OBJ as any);
      let hasControlledValue = false;

      if (nextPropsOrEmpty !== EMPTY_OBJ) {
        const isFormElement = (nextFlags & VNodeFlags.FormElement) > 0;
        if (isFormElement) {
          hasControlledValue = isControlledFormElement(nextPropsOrEmpty);
        }

        for (const prop in nextPropsOrEmpty) {
          patchProp(prop, lastPropsOrEmpty[prop], nextPropsOrEmpty[prop], dom, isSVG, hasControlledValue);
        }

        if (isFormElement) {
          processElement(
            nextFlags,
            nextVNode,
            dom,
            nextPropsOrEmpty,
            false,
            hasControlledValue
          );
        }
      }
      if (lastPropsOrEmpty !== EMPTY_OBJ) {
        for (const prop in lastPropsOrEmpty) {
          // do not add a hasOwnProperty check here, it affects performance
          if (
            isNullOrUndef(nextPropsOrEmpty[prop]) &&
            !isNullOrUndef(lastPropsOrEmpty[prop])
          ) {
            removeProp(prop, lastPropsOrEmpty[prop], dom, nextFlags);
          }
        }
      }
    }
    // inlined patchProps  -- ends --
    if (lastClassName !== nextClassName) {
      if (isNullOrUndef(nextClassName)) {
        dom.removeAttribute("class");
      } else {
        if (isSVG) {
          dom.setAttribute("class", nextClassName);
        } else {
          dom.className = nextClassName;
        }
      }
    }
    if (isFunction(nextRef) && (lastVNode.ref !== nextRef)) {
      mountRef(dom as Element, nextRef, lifecycle);
    } else {
      if (process.env.NODE_ENV !== "production") {
        if (isString(nextRef)) {
          throwError(
            'string "refs" are not supported in Inferno 1.0. Use callback "refs" instead.'
          );
        }
      }
    }
  }
}

function patchChildren(
  lastFlags: VNodeFlags,
  nextFlags: VNodeFlags,
  lastChildren,
  nextChildren,
  dom: Element,
  lifecycle: Function[],
  context: Object,
  isSVG: boolean
) {
  let patchArray = false;

  if ((nextFlags & VNodeFlags.MultipleChildren) && (lastFlags & VNodeFlags.MultipleChildren)) {
    patchArray = true;
  } else if (isInvalid(nextChildren)) {
    unmountChildren(lastChildren, dom);
  } else if (isInvalid(lastChildren)) {
    if (isStringOrNumber(nextChildren)) {
      setTextContent(dom, nextChildren);
    } else {
      if (isArray(nextChildren)) {
        mountArrayChildren(nextChildren, dom, lifecycle, context, isSVG);
      } else {
        mount(nextChildren, dom, lifecycle, context, isSVG);
      }
    }
  } else if (isStringOrNumber(nextChildren)) {
    if (isStringOrNumber(lastChildren)) {
      updateTextContent(dom, nextChildren);
    } else {
      unmountChildren(lastChildren, dom);
      setTextContent(dom, nextChildren);
    }
  } else if (isArray(nextChildren)) {
    if (isArray(lastChildren)) {
      patchArray = true;
    } else {
      unmountChildren(lastChildren, dom);
      mountArrayChildren(nextChildren, dom, lifecycle, context, isSVG);
    }
  } else if (isArray(lastChildren)) {
    removeAllChildren(dom, lastChildren);
    mount(nextChildren, dom, lifecycle, context, isSVG);
  } else if (isVNode(nextChildren)) {
    if (isVNode(lastChildren)) {
      patch(lastChildren, nextChildren, dom, lifecycle, context, isSVG);
    } else {
      unmountChildren(lastChildren, dom);
      mount(nextChildren, dom, lifecycle, context, isSVG);
    }
  }
  if (patchArray) {
    const lastLength = lastChildren.length;
    const nextLength = nextChildren.length;

    // Fast path's for both algorithms
    if (lastLength === 0) {
      if (nextLength > 0) {
        mountArrayChildren(nextChildren, dom, lifecycle, context, isSVG);
      }
    } else if (nextLength === 0) {
      removeAllChildren(dom, lastChildren);
    } else {
      if (((nextFlags & VNodeFlags.HasKeyedChildren) &&
        (lastFlags & VNodeFlags.HasKeyedChildren))
        || isKeyed(lastChildren, nextChildren)) {
        patchKeyedChildren(
          lastChildren,
          nextChildren,
          dom,
          lifecycle,
          context,
          isSVG,
          lastLength,
          nextLength
        );
      } else {
        patchNonKeyedChildren(
          lastChildren,
          nextChildren,
          dom,
          lifecycle,
          context,
          isSVG,
          lastLength,
          nextLength
        );
      }
    }
  }
}

export function updateClassComponent(
  instance,
  nextState,
  nextVNode: VNode,
  nextProps,
  parentDom,
  lifecycle: Function[],
  context,
  isSVG: boolean,
  force: boolean,
  fromSetState: boolean
) {
  const lastState = instance.state;
  const lastProps = instance.props;
  nextVNode.children = instance;
  const lastInput = instance.$LI;
  let renderOutput;

  if (instance.$UN) {
    if (process.env.NODE_ENV !== "production") {
      throwError(
        "Inferno Error: Can only update a mounted or mounting component. This usually means you called setState() or forceUpdate() on an unmounted component. This is a no-op."
      );
    }
    return;
  }
  if (lastProps !== nextProps || nextProps === EMPTY_OBJ) {
    if (!fromSetState && isFunction(instance.componentWillReceiveProps)) {
      instance.$BR = true;
      instance.componentWillReceiveProps(nextProps, context);
      // If instance component was removed during its own update do nothing...
      if (instance.$UN) {
        return;
      }
      instance.$BR = false;
    }
    if (instance.$PSS) {
      nextState = combineFrom(nextState, instance.$PS) as any;
      instance.$PSS = false;
      instance.$PS = null;
    }
  }

  /* Update if scu is not defined, or it returns truthy value or force */
  const hasSCU = isFunction(instance.shouldComponentUpdate);

  if (
    force ||
    !hasSCU ||
    (hasSCU &&
      (instance.shouldComponentUpdate as Function)(
        nextProps,
        nextState,
        context
      ))
  ) {
    if (isFunction(instance.componentWillUpdate)) {
      instance.$BS = true;
      instance.componentWillUpdate(nextProps, nextState, context);
      instance.$BS = false;
    }

    instance.props = nextProps;
    instance.state = nextState;
    instance.context = context;

    if (isFunction(options.beforeRender)) {
      options.beforeRender(instance);
    }
    renderOutput = instance.render(nextProps, nextState, context);

    if (isFunction(options.afterRender)) {
      options.afterRender(instance);
    }

    const didUpdate = renderOutput !== NO_OP;

    let childContext;
    if (isFunction(instance.getChildContext)) {
      childContext = instance.getChildContext();
    }
    if (isNullOrUndef(childContext)) {
      childContext = context;
    } else {
      childContext = combineFrom(context, childContext);
    }
    instance.$CX = childContext;

    if (didUpdate) {
      const nextInput = (instance.$LI = handleComponentInput(
        renderOutput,
        nextVNode
      ));
      patch(lastInput, nextInput, parentDom, lifecycle, childContext, isSVG);
      if (isFunction(instance.componentDidUpdate)) {
        instance.componentDidUpdate(lastProps, lastState);
      }
      if (isFunction(options.afterUpdate)) {
        options.afterUpdate(nextVNode);
      }
    }
  } else {
    instance.props = nextProps;
    instance.state = nextState;
    instance.context = context;
  }
  nextVNode.dom = instance.$LI.dom;
}

function patchComponent(
  lastVNode,
  nextVNode,
  parentDom,
  lifecycle: Function[],
  context,
  isSVG: boolean,
  isClass: boolean
): void {
  const nextType = nextVNode.type;
  const lastKey = lastVNode.key;
  const nextKey = nextVNode.key;

  if (lastVNode.type !== nextType || lastKey !== nextKey) {
    replaceWithNewNode(
      lastVNode,
      nextVNode,
      parentDom,
      lifecycle,
      context,
      isSVG
    );
  } else {
    const nextProps = nextVNode.props || EMPTY_OBJ;

    if (isClass) {
      const instance = lastVNode.children;
      instance.$UPD = true;

      updateClassComponent(
        instance,
        instance.state,
        nextVNode,
        nextProps,
        parentDom,
        lifecycle,
        context,
        isSVG,
        false,
        false
      );
      instance.$V = nextVNode;
      instance.$UPD = false;
    } else {
      let shouldUpdate = true;
      const lastProps = lastVNode.props;
      const nextHooks = nextVNode.ref;
      const nextHooksDefined = !isNullOrUndef(nextHooks);
      const lastInput = lastVNode.children;

      nextVNode.dom = lastVNode.dom;
      nextVNode.children = lastInput;
      if (lastKey !== nextKey) {
        shouldUpdate = true;
      } else {
        if (nextHooksDefined && isFunction(nextHooks.onComponentShouldUpdate)) {
          shouldUpdate = nextHooks.onComponentShouldUpdate(
            lastProps,
            nextProps
          );
        }
      }
      if (shouldUpdate !== false) {
        if (nextHooksDefined && isFunction(nextHooks.onComponentWillUpdate)) {
          nextHooks.onComponentWillUpdate(lastProps, nextProps);
        }
        let nextInput = nextType(nextProps, context);

        if (nextInput !== NO_OP) {
          nextInput = handleComponentInput(nextInput, nextVNode);
          patch(lastInput, nextInput, parentDom, lifecycle, context, isSVG);
          nextVNode.children = nextInput;
          nextVNode.dom = nextInput.dom;
          if (nextHooksDefined && isFunction(nextHooks.onComponentDidUpdate)) {
            nextHooks.onComponentDidUpdate(lastProps, nextProps);
          }
        }
      } else if (lastInput.flags & VNodeFlags.Component) {
        lastInput.parentVNode = nextVNode;
      }
    }
  }
}

function patchText(lastVNode: VNode, nextVNode: VNode, parentDom: Element) {
  const nextText = nextVNode.children as string;
  const textNode = parentDom.firstChild;
  let dom;
  // Guard against external change on DOM node.
  if (isNull(textNode)) {
    setTextContent(parentDom, nextText);
    dom = parentDom.firstChild as Element;
  } else {
    dom = lastVNode.dom;
    if (nextText !== lastVNode.children) {
      (dom as Element).nodeValue = nextText;
    }
  }
  nextVNode.dom = dom;
}

function patchNonKeyedChildren(
  lastChildren,
  nextChildren,
  dom,
  lifecycle: Function[],
  context: Object,
  isSVG: boolean,
  lastChildrenLength: number,
  nextChildrenLength: number
) {
  const commonLength =
    lastChildrenLength > nextChildrenLength
      ? nextChildrenLength
      : lastChildrenLength;
  let i = 0;

  for (; i < commonLength; i++) {
    let nextChild = nextChildren[i];

    if (nextChild.dom) {
      nextChild = nextChildren[i] = directClone(nextChild);
    }
    patch(lastChildren[i], nextChild, dom, lifecycle, context, isSVG);
  }
  if (lastChildrenLength < nextChildrenLength) {
    for (i = commonLength; i < nextChildrenLength; i++) {
      let nextChild = nextChildren[i];

      if (nextChild.dom) {
        nextChild = nextChildren[i] = directClone(nextChild);
      }
      appendChild(dom, mount(nextChild, null, lifecycle, context, isSVG));
    }
  } else if (lastChildrenLength > nextChildrenLength) {
    for (i = commonLength; i < lastChildrenLength; i++) {
      unmount(lastChildren[i], dom);
    }
  }
}

function patchKeyedChildren(
  a: VNode[],
  b: VNode[],
  dom,
  lifecycle: Function[],
  context,
  isSVG: boolean,
  aLength: number,
  bLength: number
) {
  if (process.env.NODE_ENV !== 'production') {
    validateKeys(b, true);
  }

  let aEnd = aLength - 1;
  let bEnd = bLength - 1;
  let aStart = 0;
  let bStart = 0;
  let i;
  let j;
  let aNode;
  let bNode;
  let nextNode;
  let nextPos;
  let node;
  let aStartNode = a[aStart];
  let bStartNode = b[bStart];
  let aEndNode = a[aEnd];
  let bEndNode = b[bEnd];

  if (bStartNode.dom) {
    b[bStart] = bStartNode = directClone(bStartNode);
  }
  if (bEndNode.dom) {
    b[bEnd] = bEndNode = directClone(bEndNode);
  }
  // Step 1
  // tslint:disable-next-line
  outer: {
    // Sync nodes with the same key at the beginning.
    while (aStartNode.key === bStartNode.key) {
      patch(aStartNode, bStartNode, dom, lifecycle, context, isSVG);
      aStart++;
      bStart++;
      if (aStart > aEnd || bStart > bEnd) {
        break outer;
      }
      aStartNode = a[aStart];
      bStartNode = b[bStart];
      if (bStartNode.dom) {
        b[bStart] = bStartNode = directClone(bStartNode);
      }
    }

    // Sync nodes with the same key at the end.
    while (aEndNode.key === bEndNode.key) {
      patch(aEndNode, bEndNode, dom, lifecycle, context, isSVG);
      aEnd--;
      bEnd--;
      if (aStart > aEnd || bStart > bEnd) {
        break outer;
      }
      aEndNode = a[aEnd];
      bEndNode = b[bEnd];
      if (bEndNode.dom) {
        b[bEnd] = bEndNode = directClone(bEndNode);
      }
    }
  }

  if (aStart > aEnd) {
    if (bStart <= bEnd) {
      nextPos = bEnd + 1;
      nextNode = nextPos < bLength ? b[nextPos].dom : null;
      while (bStart <= bEnd) {
        node = b[bStart];
        if (node.dom) {
          b[bStart] = node = directClone(node);
        }
        bStart++;
        insertOrAppend(
          dom,
          mount(node, null, lifecycle, context, isSVG),
          nextNode
        );
      }
    }
  } else if (bStart > bEnd) {
    while (aStart <= aEnd) {
      unmount(a[aStart++], dom);
    }
  } else {
    const aLeft = aEnd - aStart + 1;
    const bLeft = bEnd - bStart + 1;
    const sources = new Array(bLeft);

    // Mark all nodes as inserted.
    for (i = 0; i < bLeft; i++) {
      sources[i] = -1;
    }
    let moved = false;
    let pos = 0;
    let patched = 0;

    // When sizes are small, just loop them through
    if (bLeft <= 4 || aLeft * bLeft <= 16) {
      for (i = aStart; i <= aEnd; i++) {
        aNode = a[i];
        if (patched < bLeft) {
          for (j = bStart; j <= bEnd; j++) {
            bNode = b[j];
            if (aNode.key === bNode.key) {
              sources[j - bStart] = i;

              if (pos > j) {
                moved = true;
              } else {
                pos = j;
              }
              if (bNode.dom) {
                b[j] = bNode = directClone(bNode);
              }
              patch(aNode, bNode, dom, lifecycle, context, isSVG);
              patched++;
              a[i] = null as any;
              break;
            }
          }
        }
      }
    } else {
      const keyIndex = new Map();

      // Map keys by their index in array
      for (i = bStart; i <= bEnd; i++) {
        keyIndex.set(b[i].key, i);
      }

      // Try to patch same keys
      for (i = aStart; i <= aEnd; i++) {
        aNode = a[i];

        if (patched < bLeft) {
          j = keyIndex.get(aNode.key);

          if (!isUndefined(j)) {
            bNode = b[j];
            sources[j - bStart] = i;
            if (pos > j) {
              moved = true;
            } else {
              pos = j;
            }
            if (bNode.dom) {
              b[j] = bNode = directClone(bNode);
            }
            patch(aNode, bNode, dom, lifecycle, context, isSVG);
            patched++;
            a[i] = null as any;
          }
        }
      }
    }
    // fast-path: if nothing patched remove all old and add all new
    if (aLeft === aLength && patched === 0) {
      removeAllChildren(dom, a);
      while (bStart < bLeft) {
        node = b[bStart];
        if (node.dom) {
          b[bStart] = node = directClone(node);
        }
        bStart++;
        insertOrAppend(dom, mount(node, null, lifecycle, context, isSVG), null);
      }
    } else {
      i = aLeft - patched;
      while (i > 0) {
        aNode = a[aStart++];
        if (!isNull(aNode)) {
          unmount(aNode, dom);
          i--;
        }
      }
      if (moved) {
        const seq = lis_algorithm(sources);
        j = seq.length - 1;
        for (i = bLeft - 1; i >= 0; i--) {
          if (sources[i] === -1) {
            pos = i + bStart;
            node = b[pos];
            if (node.dom) {
              b[pos] = node = directClone(node);
            }
            nextPos = pos + 1;
            insertOrAppend(
              dom,
              mount(node, null, lifecycle, context, isSVG),
              nextPos < bLength ? b[nextPos].dom : null
            );
          } else {
            if (j < 0 || i !== seq[j]) {
              pos = i + bStart;
              node = b[pos];
              nextPos = pos + 1;
              insertOrAppend(
                dom,
                node.dom,
                nextPos < bLength ? b[nextPos].dom : null
              );
            } else {
              j--;
            }
          }
        }
      } else if (patched !== bLeft) {
        // when patched count doesn't match b length we need to insert those new ones
        // loop backwards so we can use insertBefore
        for (i = bLeft - 1; i >= 0; i--) {
          if (sources[i] === -1) {
            pos = i + bStart;
            node = b[pos];
            if (node.dom) {
              b[pos] = node = directClone(node);
            }
            nextPos = pos + 1;
            insertOrAppend(
              dom,
              mount(node, null, lifecycle, context, isSVG),
              nextPos < bLength ? b[nextPos].dom : null
            );
          }
        }
      }
    }
  }
}

// // https://en.wikipedia.org/wiki/Longest_increasing_subsequence
function lis_algorithm(arr: number[]): number[] {
  const p = arr.slice(0);
  const result: number[] = [0];
  let i;
  let j;
  let u;
  let v;
  let c;
  const len = arr.length;

  for (i = 0; i < len; i++) {
    const arrI = arr[i];

    if (arrI !== -1) {
      j = result[result.length - 1];
      if (arr[j] < arrI) {
        p[i] = j;
        result.push(i);
        continue;
      }

      u = 0;
      v = result.length - 1;

      while (u < v) {
        c = ((u + v) / 2) | 0;
        if (arr[result[c]] < arrI) {
          u = c + 1;
        } else {
          v = c;
        }
      }

      if (arrI < arr[result[u]]) {
        if (u > 0) {
          p[i] = result[u - 1];
        }
        result[u] = i;
      }
    }
  }

  u = result.length;
  v = result[u - 1];

  while (u-- > 0) {
    result[u] = v;
    v = p[v];
  }

  return result;
}
