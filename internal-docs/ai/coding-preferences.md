# Coding preferences

- Avoid nested ternary expressions. For multiple branches, use a small named helper with explicit `if` statements. Keep the helper private to its owning module when it has no other callers.
- Define a named `Params` type for an object parameter instead of declaring the object type inline in the function signature. Keep private parameter types beside their owning helper.
