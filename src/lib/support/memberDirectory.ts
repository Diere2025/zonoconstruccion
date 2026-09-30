import type { Person } from './types';

// These two verified ERP accounts belong to Pablo Jara. Keep the operational
// Logistics account selectable without removing either identity from history.
const verifiedAliases = [
    { alias: '2b889ba2-f936-4494-aeff-35a279605ed7', preferred: '1b64f354-e229-41c9-8c5f-ca294878f70f' },
];

export function selectableSupportPeople(people: Person[]): Person[] {
    const active = people.filter(person => person.active);
    return active.filter(person => !verifiedAliases.some(pair => {
        if (person.id !== pair.alias) return false;
        const preferred = active.find(candidate => candidate.id === pair.preferred);
        return preferred?.name.trim().toLocaleLowerCase('es-AR') === person.name.trim().toLocaleLowerCase('es-AR');
    }));
}
