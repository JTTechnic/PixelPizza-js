import { OrderStatus } from "@prisma/client";
import { ApplyOptions } from "@sapphire/decorators";
import type { ApplicationCommandRegistry } from "@sapphire/framework";
import { Time } from "@sapphire/time-utilities";
import type { AutocompleteInteraction, CommandInteraction } from "discord.js";
import { OrderCommand as Command } from "../lib/commands/OrderCommand";

@ApplyOptions<Command.Options>({
	description: "Look at an order",
	preconditions: [["ChefOnly"], ["DelivererOnly"], "ValidOrderData"],
	cooldownDelay: Time.Second * 5
})
export class LookCommand extends Command {
	public override registerApplicationCommands(registry: ApplicationCommandRegistry) {
		this.registerPrivateChatInputCommand(
			registry,
			this.defaultChatInputCommand.addStringOption((input) =>
				input.setName("order").setDescription("The ID of the order").setRequired(true).setAutocomplete(true)
			)
		);
	}

	public override autocompleteRun(interaction: AutocompleteInteraction) {
		return this.autocompleteOrder(
			interaction,
			(focused) => ({
				where: {
					OR: {
						id: {
							startsWith: focused
						},
						order: {
							contains: focused
						}
					}
				},
				orderBy: {
					id: "asc"
				}
			}),
			(orders) =>
				orders.sort((orderA, orderB) => {
					const { status: statusA } = orderA;
					const { status: statusB } = orderB;
					if (statusA === statusB) return 0;
					if (statusA === OrderStatus.DELETED) return 1;
					if (statusB === OrderStatus.DELETED) return -1;
					return 0;
				})
		);
	}

	public override async chatInputRun(interaction: CommandInteraction) {
		await interaction.deferReply({ ephemeral: true });
		return interaction.editReply({ embeds: [await this.createOrderEmbed(await this.getOrder(interaction))] });
	}
}
