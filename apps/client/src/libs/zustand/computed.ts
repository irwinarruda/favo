import type { StateCreator, StoreMutatorIdentifier } from 'zustand';

const computedKeyPrefix = '$$_computed_';
let computedKeySequence = 0;

type ComputedDependencies = readonly unknown[];
type ComputedDependenciesSelector<Store, Dependencies extends ComputedDependencies> = (store: Store) => Dependencies;
type ComputedProducer<Store, ComputedState> = (store: Store) => ComputedState;

function assignChangedValues(state: any, values: any) {
  let nextState = state;

  for (const [key, value] of Object.entries(values)) {
    if (Object.is(state[key], value)) continue;
    if (nextState === state) nextState = { ...state };
    nextState[key] = value;
  }

  return nextState;
}

function applyComputedState(state: any) {
  const computedProducers = Object.entries(state)
    .filter(([key]) => key.startsWith(computedKeyPrefix))
    .map(([, value]) => value as ComputedProducer<any, any>);

  return computedProducers.reduce((currentState, producer) => {
    return assignChangedValues(currentState, producer(currentState));
  }, state);
}

function injectComputedMiddleware(stateCreator: StateCreator<any>): StateCreator<any> {
  return (set, get, api) => {
    function setWithComputed(update: any, replace?: boolean) {
      set((state: any) => {
        const updatedState = typeof update === 'function' ? update(state) : update;
        return applyComputedState(Object.assign({}, state, updatedState));
      }, replace as any);
    }

    api.setState = setWithComputed as typeof api.setState;
    return applyComputedState(stateCreator(setWithComputed, get, api));
  };
}

function areDependenciesEqual(previous: ComputedDependencies, next: ComputedDependencies) {
  return previous.length === next.length && next.every((dependency, index) => Object.is(dependency, previous[index]));
}

function memoizeComputedState<Store, Dependencies extends ComputedDependencies, ComputedState>(
  selectDependencies: ComputedDependenciesSelector<Store, Dependencies>,
  producer: ComputedProducer<Store, ComputedState>
) {
  let cache: { dependencies: Dependencies; state: ComputedState } | undefined;

  return (store: Store) => {
    const dependencies = selectDependencies(store);
    if (cache && areDependenciesEqual(cache.dependencies, dependencies)) return cache.state;

    const state = producer(store);
    cache = { dependencies, state };
    return state;
  };
}

function registerComputedState<Store, ComputedState extends Partial<Store>>(
  producer: ComputedProducer<Store, ComputedState>
) {
  const key = `${computedKeyPrefix}${computedKeySequence++}`;
  return { [key]: producer } as ComputedState;
}

export function compute<Store, ComputedState extends Partial<Store>>(
  _get: () => Store,
  producer: ComputedProducer<Store, ComputedState>
) {
  return registerComputedState(producer);
}

export function computeFrom<
  Store,
  const Dependencies extends ComputedDependencies,
  ComputedState extends Partial<Store>,
>(
  _get: () => Store,
  selectDependencies: ComputedDependenciesSelector<Store, Dependencies>,
  producer: ComputedProducer<Store, ComputedState>
) {
  return registerComputedState(memoizeComputedState(selectDependencies, producer));
}

type Computed = <
  State,
  MutatorsBefore extends [StoreMutatorIdentifier, unknown][] = [],
  MutatorsAfter extends [StoreMutatorIdentifier, unknown][] = [],
>(
  stateCreator: StateCreator<State, MutatorsBefore, MutatorsAfter>
) => StateCreator<State, MutatorsBefore, MutatorsAfter>;

export const computed = ((stateCreator: StateCreator<any>) =>
  injectComputedMiddleware(stateCreator)) as unknown as Computed;
