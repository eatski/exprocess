export type StoreLogic<
    State,
    Command,
    Result
    > = {
        initial: State,
        script: (prev: State, command: Command) => Result
        reducer: (prev: State, result: Result) => State
    }

export type CommandRecordInput<Command, Result> = { command: Command, result: Result }
export type CommandRecord<Command, Result> = { command: Command, result: Result, id: string }

export interface RecordRepository<Command, Result> {
    add: (record: CommandRecordInput<Command, Result>) => { id: string, exec: () => Promise<void> };
    sync: (listener: (records: CommandRecord<Command, Result>[]) => void) => () => void
}

export type Store<
    Command,
    > = {
        dispatch: (command: Command) => Promise<void>
        removeListener: () => void
    }

export const createStore = <
    State,
    Command,
    Result,
    >(
        { script, reducer, initial }: StoreLogic<State, Command, Result>,
        listener: (records: CommandRecord<Command, Result>[], state: State) => void,
        repository: RecordRepository<Command, Result>
    ): Store<Command> => {
    let state: State = initial;
    let stacked: string[] = []
    const _script = (state: State, command: Command): Result => {
        try {
            return script(state, command)
        } catch (error) {
            console.error(error);
            throw new Error(`
                Invalid command:

                Previous state => ${JSON.stringify(state)},
                Command => ${JSON.stringify(command)}

                >>>
                ${error}
            `)
        }
    }
    const _reducer = (state: State, result: Result): State => {
        try {
            return reducer(state, result)
        } catch (error) {
            console.error(error);
            throw new Error(`
                Invalid reducing:

                Previous state => ${JSON.stringify(state)},
                Result => ${JSON.stringify(result)}

                >>>
                ${error}
            `)
        }
    }
    const dispatch = (command: Command) => {
        const result = _script(state, command);
        const { id, exec } = repository.add({ result, command })
        stacked = [...stacked, id];
        state = _reducer(state, result);
        listener([{ result, command, id }], state);
        return exec();
    }
    const removeListener = repository.sync((records) => {
        const notStacked = records.filter(record => !stacked.some(id => record.id === id))
        state = notStacked.reduce((acc, { result }) => _reducer(acc, result), state);
        stacked = stacked.filter(id => !records.some(record => record.id === id));
        listener(notStacked, state);
    })
    return {
        dispatch,
        removeListener
    }
}

