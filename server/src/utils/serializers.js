// Never send passwordHash to the client — this is the one place every
// controller shapes a User row into its public API-response fields.
export function toPublicUser(user) {
  const { id, email, fullName, role, phone, timezone, createdAt } = user;
  return { id, email, fullName, role, phone, timezone, createdAt };
}
