#!/bin/sh

CONFIG_FILE="/etc/config/dhcp"

# Получаем параметры из QUERY_STRING
ACTION=$(echo "$QUERY_STRING" | awk -F'[=&]' '{print $2}')
DOMAIN=$(echo "$QUERY_STRING" | awk -F'[=&]' '{ for(i=1;i<=NF;i++) if ($i=="domain") print $(i+1) }' | sed 's/%\([0-9A-F][0-9A-F]\)/\\\\\x\1/g' | xargs -0 printf "%b")

# Функция для проверки существования домена
domain_exists() {
    local domain="$1"
    uci show dhcp | grep -q "dhcp.@ipset.*.domain='$domain'"
    return $?
}

# Функция для добавления домена
add_domain() {
    local domain="$1"
    
    if domain_exists "$domain"; then
        echo "Домен $domain уже существует в списке."
        return 1
    fi
    
    # Находим или создаем секцию ipset
    local ipset_section=$(uci show dhcp | grep "dhcp.@ipset" | head -n1 | cut -d'=' -f1 | cut -d'.' -f2-3)
    
    if [ -z "$ipset_section" ]; then
        # Создаем новую секцию ipset
        uci add dhcp ipset >/dev/null
        uci set dhcp.@ipset[-1].name='vpn_domains'
        ipset_section="@ipset[-1]"
    fi
    
    uci add_list dhcp.$ipset_section.domain="$domain"
    uci commit dhcp
    echo "Домен $domain успешно добавлен."
    return 0
}

# Функция для удаления домена
remove_domain() {
    local domain="$1"
    
    if ! domain_exists "$domain"; then
        echo "Домен $domain не найден в списке."
        return 1
    fi
    
    # Находим все секции ipset и удаляем домен из них
    local sections=$(uci show dhcp | grep "dhcp.@ipset" | cut -d'=' -f1)
    for section in $sections; do
        uci del_list "$section.domain=$domain"
    done
    
    uci commit dhcp
    echo "Домен $domain успешно удален."
    return 0
}

# Функция для вывода списка доменов
list_domains() {
    echo "Список доменов в ipset:"
    uci show dhcp | awk -F"'" '/dhcp.@ipset.*.domain=/ {for(i=2;i<=NF;i+=2) print $i}' | sort
    return 0
}

# Основная логика обработки запросов
case "$ACTION" in
    add)
        [ -z "$DOMAIN" ] && { echo "Ошибка: не указан домен"; exit 1; }
        add_domain "$DOMAIN"
        ;;
    remove)
        [ -z "$DOMAIN" ] && { echo "Ошибка: не указан домен"; exit 1; }
        remove_domain "$DOMAIN"
        ;;
    list)
        list_domains
        ;;
    *)
        echo "Неизвестное действие. Используйте action=add, action=remove или action=list"
        exit 1
        ;;
esac

# Перезапускаем dnsmasq для применения изменений
/etc/init.d/dnsmasq restart >/dev/null 2>&1

exit 0