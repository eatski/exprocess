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


export type RecordRepositoryListener<Command, Result> = (records: CommandRecord<Command, Result>[]) => void
export interface RecordRepository<Command, Result> {
    save: (record: CommandRecordInput<Command, Result>) => { id: string, exec: () => Promise<void> };
    unwatch: () => void
}

export interface CreateRecordRepository<Command, Result> {
    (listener: RecordRepositoryListener<Command, Result>) : RecordRepository<Command, Result> 
}

export type Store<Command> = {
        dispatch: (command: Command) => Promise<void>
        unwatch: () => void
    }

export const createStore = <
    State,
    Command,
    Result,
    >(
        { script, reducer, initial }: StoreLogic<State, Command, Result>,
        listener: (records: CommandRecord<Command, Result>[], state: State) => void,
        createRepository: CreateRecordRepository<Command, Result>
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
    const repository = createRepository((records) => {
        const notStacked = records.filter(record => !stacked.some(id => record.id === id))
        state = notStacked.reduce((acc, { result }) => _reducer(acc, result), state);
        stacked = stacked.filter(id => !records.some(record => record.id === id));
        listener(notStacked, state);
    })
    return {
        dispatch(command: Command) {
            const result = _script(state, command);
            const { id, exec } = repository.save({ result, command })
            stacked = [...stacked, id];
            state = _reducer(state, result);
            listener([{ result, command, id }], state);
            return exec();
        },
        unwatch(){
            repository.unwatch()
        }
    }
}

