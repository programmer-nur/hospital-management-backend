import config from "./app/config";
import { User } from "./app/modules/user/user.model";
import { DEFAULT_USERS } from "./defaults/users";
import bcrypt from "bcrypt";

import NotFoundError from "./app/errors/not-found";

export async function seedDataBaseIfRequired() {
  const requiredUsers = DEFAULT_USERS;

  if ((await User.countDocuments()) == 0) {
    //update users
    for (const [index, user] of requiredUsers.entries()) {
      const salt = await bcrypt.genSalt(config.bcrypt_salt_rounds);
      user.password = await bcrypt.hash(user.password, salt);

      await User.updateOne({ email: user.email }, user, { upsert: true });
      const dbUser = await User.findOne({ email: user.email });
      if (!dbUser) {
        throw new NotFoundError("Problem in User Creation");
      }
    }

    console.log("Databases Seeded with default Users");
  }
}
