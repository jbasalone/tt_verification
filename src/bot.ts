import { Client, GatewayIntentBits, Message, TextChannel, EmbedBuilder } from "discord.js";
import dotenv from "dotenv";
import {
    assignTimeTravelRole,
    registerTimeTravelRoleMap,
    isInVerificationChannel,
    deleteRoleMapping,
} from "./TimeTravelManager";
import { initDatabase, GuildConfig, RoleConfig } from "./database";

dotenv.config();

const TOKEN = process.env.DISCORD_BOT_TOKEN;
if (!TOKEN) throw new Error("Missing DISCORD_BOT_TOKEN in .env file");

const PREFIX_REGEX = /^ep\s+tt(\s+|$)/i; // Matches 'ep tt' with or without a trailing command
const EPIC_RPG_BOT_ID = "555955826880413696";

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildMembers,
    ],
});

client.once("ready", async () => {
    await initDatabase();
    console.log(`Bot is online as ${client.user?.tag}`);
});

client.on("messageCreate", async (message: Message) => {
    try {
        // Handle Epic RPG bot embeds
        if (
            message.author.bot &&
            message.author.id === EPIC_RPG_BOT_ID &&
            message.embeds.length > 0 &&
            message.guild
        ) {
            const embed = message.embeds[0];
            console.log("Detected an Epic RPG embed:", embed);

            const isVerifiedChannel = await isInVerificationChannel(message.guild.id, message.channel.id);
            if (!isVerifiedChannel) {
                console.log("Message ignored: not in the configured verification channel.");
                return;
            }

            const progressField = embed.fields.find((field) => field.name === "PROGRESS");
            if (!progressField) {
                console.log("No PROGRESS field found in the embed.");
                return;
            }

            const timeTravelMatch = progressField.value.match(/\*\*Time travels\*\*: (\d+)/);
            if (!timeTravelMatch) {
                console.log("No Time travels value found in the PROGRESS field.");
                return;
            }

            const timeTravelCount = parseInt(timeTravelMatch[1], 10);
            console.log(`Extracted time travel count: ${timeTravelCount}`);

            // Fetch messages and filter valid ones
            // Fetch messages
            const fetchedMessages = await message.channel.messages.fetch({ limit: 50 });

            // Filter and convert to array
            const messagesArray = Array.from(
                [...fetchedMessages.values()].filter((msg): msg is Message<true> => msg.inGuild()) // Filter valid guild messages
            );

            console.log(
                "Fetched messages:",
                messagesArray.map((msg) => `${msg.author.username}: ${msg.content}`).join("\n")
            );

            const previousMessage = messagesArray.find((msg) =>
                ["rpg p", "rpg profile"].includes(msg.content.toLowerCase())
            );

            if (!previousMessage) {
                console.log("No valid 'rpg p' or 'rpg profile' command found prior to this embed.");
                await message.channel.send("Only the account owner can validate time travel levels.");
                return;
            }

            const usernameFromEmbed = embed.author?.name?.split(" — ")[0]?.toLowerCase();
            const previousAuthor = previousMessage.author.username.toLowerCase();

            if (usernameFromEmbed !== previousAuthor) {
                console.log(
                    `Profile mismatch: Embed profile "${usernameFromEmbed}" does not match the command author "${previousAuthor}".`
                );
                await message.channel.send("Only the account owner can validate time travel levels.");
                return;
            }

            console.log(
                `Processing time travel roles for ${previousMessage.author.tag} (profile: "${usernameFromEmbed}").`
            );
            await assignTimeTravelRole(previousMessage.member!, timeTravelCount, message.channel as TextChannel);
        }

        // Command Handling
        const match = message.content.match(PREFIX_REGEX);
        if (!match) return;

        const args = message.content.slice(match[0].length).trim().split(/\s+/);
        const command = args.shift()?.toLowerCase();

        if (!command || command === "") {
            const helpEmbed = new EmbedBuilder()
                .setTitle("Time Travel Bot Commands")
                .setColor("Blue")
                .setDescription("Here are the available commands for the Time Travel Bot:")
                .addFields(
                    { name: "Set Role", value: "`ep tt setrole <min> <max> <role_id>`\n`ep tt setrole <min>+ <role_id>`" },
                    { name: "Set Verification Channel", value: "`ep tt setchannel`" },
                    { name: "View Configuration", value: "`ep tt config`" },
                    { name: "Delete Role Mapping", value: "`ep tt delrole <role_id>`" }
                )
                .setFooter({ text: "Use the commands to configure roles and channels for time travel tracking." });

            await message.reply({ embeds: [helpEmbed] });
            return;
        }

        if (command === "setrole" && message.guild) {
            if (!message.member?.permissions.has("ManageRoles")) {
                await message.reply("You don't have permission to use this command.");
                return;
            }

            const rangeArg = args[0];
            const roleId = args[1];

            if (!rangeArg || !roleId) {
                await message.reply("Usage: `ep tt setrole <min> <max> <role_id>` or `ep tt setrole <min>+ <role_id>`");
                return;
            }

            const min = parseInt(rangeArg.replace("+", ""), 10);
            const isOpenEnded = rangeArg.endsWith("+");
            const max = isOpenEnded ? null : parseInt(args[2], 10);

            if (isNaN(min) || (!isOpenEnded && (max === null || isNaN(max)))) {
                await message.reply(
                    "Usage: `ep tt setrole <min> <max> <role_id>` or `ep tt setrole <min>+ <role_id>`\nExample: `ep tt setrole 25+ 123456789012345678`"
                );
                return;
            }

            const role = message.guild.roles.cache.get(roleId);
            if (!role) {
                await message.reply(`Role with ID \`${roleId}\` not found.`);
                return;
            }

            await registerTimeTravelRoleMap(message.guild.id, min, max, role.id);

            await message.reply(
                `Configured role with ID \`${role.id}\` for time travel range ${min}-${
                    max ?? "infinity"
                }.`
            );
        } else if (command === "setchannel" && message.guild) {
            if (!message.member?.permissions.has("ManageGuild")) {
                await message.reply("You don't have permission to use this command.");
                return;
            }

            await GuildConfig.upsert({
                guildId: message.guild.id,
                verificationChannelId: message.channel.id,
            });

            await message.reply(`Verification channel set to <#${message.channel.id}>.`);
        } else if (command === "config" && message.guild) {
            if (!message.member?.permissions.has("ManageGuild")) {
                await message.reply("You don't have permission to use this command.");
                return;
            }

            const guildConfig = await GuildConfig.findOne({ where: { guildId: message.guild.id } });
            const roleConfigs = await RoleConfig.findAll({ where: { guildId: message.guild.id } });

            const embed = new EmbedBuilder()
                .setTitle("Server Configuration")
                .setColor("Blue")
                .addFields(
                    { name: "Verification Channel", value: guildConfig?.verificationChannelId ? `<#${guildConfig.verificationChannelId}>` : "Not Set" },
                    {
                        name: "Role Mappings",
                        value: roleConfigs.length > 0
                            ? roleConfigs
                                .map((config) => `Role <@&${config.roleId}>: ${config.min} - ${config.max ?? "infinity"}`)
                                .join("\n")
                            : "No roles configured."
                    }
                );

            await message.reply({ embeds: [embed] });
        } else if (command === "delrole" && message.guild) {
            if (!message.member?.permissions.has("ManageRoles")) {
                await message.reply("You don't have permission to use this command.");
                return;
            }

            const roleId = args[0];
            if (!roleId) {
                await message.reply("Usage: `ep tt delrole <role_id>`");
                return;
            }

            await deleteRoleMapping(message.guild.id, roleId);
            await message.reply(`Deleted role mapping for role ID \`${roleId}\`.`);
        } else {
            await message.reply("Unknown command. Use `ep tt` to view available commands.");
        }
    } catch (error) {
        console.error("Error handling messageCreate event:", error);
        await message.reply("An error occurred while processing your request.");
    }
});

client.login(TOKEN);