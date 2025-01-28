import { Sequelize, DataTypes, Model } from "sequelize";

// Initialize Sequelize
const sequelize = new Sequelize({
    dialect: "sqlite",
    storage: "roles.sqlite",
    logging: false, // Enable SQL query logging
});

// Role configuration model
export class RoleConfig extends Model {
    declare guildId: string;
    declare min: number;
    declare max: number | null; // Null represents open-ended range
    declare roleId: string;
}

RoleConfig.init(
    {
        guildId: { type: DataTypes.STRING, allowNull: false },
        min: { type: DataTypes.INTEGER, allowNull: false },
        max: { type: DataTypes.INTEGER, allowNull: true },
        roleId: { type: DataTypes.STRING, allowNull: false },
    },
    {
        sequelize,
        modelName: "RoleConfig",
        timestamps: true,
    }
);

// Guild configuration model
export class GuildConfig extends Model {
    declare guildId: string;
    declare verificationChannelId: string | null;
}

GuildConfig.init(
    {
        guildId: { type: DataTypes.STRING, allowNull: false, unique: true },
        verificationChannelId: { type: DataTypes.STRING, allowNull: true },
    },
    {
        sequelize,
        modelName: "GuildConfig",
        timestamps: true,
    }
);

// Initialize database and synchronize models
export async function initDatabase(): Promise<void> {
    try {
        await sequelize.sync({ alter: true }); // Update schema without dropping data
        console.log("Database initialized!");
    } catch (error) {
        console.error("Error initializing database:", error);
    }
}

export { sequelize };