import "@sapphire/plugin-logger/register";
import { Client } from "./lib/Client";
import { config } from "dotenv";
import parseEnv from "dotenv-parse-variables";
import { ApplicationCommandRegistries, RegisterBehavior } from "@sapphire/framework";
import { ModelManagerStore } from "./lib/stores/ModelManagerStore";
import { join } from "path";
import { WebhookManagerStore } from "./lib/stores/WebhookManagerStore";
process.env = parseEnv(config().parsed!) as NodeJS.ProcessEnv;

const client = new Client();

ApplicationCommandRegistries.setDefaultBehaviorWhenNotIdentical(RegisterBehavior.Overwrite);

client.stores
    .register(new ModelManagerStore().registerPath(join(__dirname, "models")))
    .register(new WebhookManagerStore().registerPath(join(__dirname, "webhooks")));

void client.login(process.env.TOKEN);
